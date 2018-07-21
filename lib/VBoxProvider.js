/**
 * @module lib/VBoxProvider
 */

const execute = require('./commands/execute');
const execSync = require('child_process').execSync;
const exec = require('child_process').exec;
const { promisify } = require('util');
const execAsync = promisify(exec);
const mustache = require('mustache');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const ipUtil = require('ip');
const util = require('../lib/util');
const VBexe = process.platform === 'win32' ? '"C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe"' : 'VBoxManage';

class VBoxProvider {

    /**
     * Get default run command.
     *
     * @param   {String} name Name of virtual machine.
     * @param   {String} ovf  Path of image to clone/import.
     * @returns {Object}      Promise.
     */
    async provision(name, ovf, verbose) {
        await execute("import", `${ovf} --vsys 0 --vmname ${name}`, verbose)
    }

    _calculateGateway(ip, mask='255.255.255.0'){
        let networkAddress = ipUtil.mask(ip, mask);
        return ipUtil.cidrSubnet(networkAddress + '/26').firstAddress;
    }

    async customize(name, ip, ssh_port, verbose) {
        // modifyvm ${VM} --uart1 0x3f8 4 --uartmode1 disconnected
        await execute("modifyvm", `${name}  --uart1 0x3f8 4 --uartmode1 disconnected`, verbose);
        
        // NIC1 =======
        await execute("modifyvm", `${name} --nic1 nat`, verbose);
        await execute("modifyvm", `${name} --nictype1 virtio`, verbose);

        // NIC2 =======
        let VBOXNET = null;
        // check if any adapters with this ip :
        let gateway = this._calculateGateway(ip);
        let adapter = (await this.hostonlyifs()).filter(e => e.IPAddress === gateway)[0];
        if (adapter)
        {
            VBOXNET = adapter.Name;
            console.log(`Using ${gateway} in ${VBOXNET}`);
        }
        else 
        {
            let stdout = (await execAsync(`${VBexe} hostonlyif create`)).stdout;
            VBOXNET = stdout.substr(stdout.indexOf(`'`) + 1, stdout.lastIndexOf(`'`) - stdout.indexOf(`'`) - 1);
            console.log('created adapter:', VBOXNET);
        }

        await execute("hostonlyif", `ipconfig "${VBOXNET}" --ip ${gateway}`, verbose);
        
        await execute("modifyvm", `${name} --hostonlyadapter2 "${VBOXNET}"`, verbose);
        await execute("modifyvm", `${name} --nic2 hostonly`, verbose);
        await execute("modifyvm", `${name} --nictype2 virtio`, verbose);

        // port forwarding
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${ssh_port},,22"`, verbose);
    }

    async start(name, verbose) {
        await execute("startvm", `${name} --type headless`, verbose);
    }

    // setting /etc/network/interfaces
    async postSetup(ip, port, sshKeyPath, verbose) {
        let interfacesPath = path.resolve(__dirname, '../config/interfaces.mustache');

        // render and create interfaces in /tmp/interfaces
        let tmpFile = path.join(os.tmpdir(),'interfaces');
        let interfaces = mustache.render((await fs.readFile(interfacesPath)).toString(), {ip});
        await fs.writeFile(tmpFile, interfaces);
        
        try {
            let cmd = `echo "waiting too start"`;
            await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000);
        } catch (error) {
            throw `Timed out.`;
        }

        // cp /tmp/interfaces vm:/tmp/interfaces
        try {
            await util.scp(tmpFile, '/tmp/interfaces', {port, user: 'vagrant', private_key: sshKeyPath});
        } catch (error) {
            throw `failed to generate interfaces configuration, ${error}`;
        }

        // mv vm:/tmp/interfaces /etc/network/interfaces, 
        // sudo systemctl restart networking
        // ifdown ens0p8; ifup ens0p8
        try {
            let cmd = `sudo cp /tmp/interfaces /etc/network/interfaces && sudo systemctl restart networking && sudo ifdown enp0s8 && sudo ifup enp0s8`;
            await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000, verbose);
        } catch (error) {
            throw `failed to copy interfaces configuration, ${error}`;
        }
    }

    async list() {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} list vms`, (error, stdout, stderr) => {
                if(error || stderr) {
                    console.error(`exec error: vboxmanage list`);
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }

                let list = [];
                let lines = stdout.split('\n');
                for (let i = 0; i < lines.length-1; i++) {
                    let lineSplit = lines[i].split(' ');
                    let name= lineSplit[0].replace(/"/g, '');
                    let id = lineSplit[1].replace(/{|}/g, '');
                    list.push({name, id});
                }
                resolve(list);
            })
        });
    }

    async hostonlyifs(){
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} list hostonlyifs`, (error, stdout, stderr) => {
                if(error || stderr) {
                    console.error(`exec error: vboxmanage list`);
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }

                let hostonlyifs = [];
                stdout.split(/\r?\n\r?\n/).forEach(adapters => {
                    if(adapters.length > 0) {
                        let adapter = {};
                        adapters.split('\n').forEach(line => {
                            if(line.length > 0) {
                                let splitIdx = line.indexOf(':');
                                adapter[line.substr(0, splitIdx).trim()] = line.substr(splitIdx+1).trim();
                            }
                        })
                        hostonlyifs.push(adapter);
                    }
                })

                resolve(hostonlyifs);
            })
        });
    }

    async check(ovf, name) {
        return new Promise(async function (resolve, reject) {
            // check if box already exists
            if(!(await fs.exists(path.resolve(ovf)))) {
                reject(`file not found ${ovf}`);
            }

            // Progress state: VBOX_E_FILE_ERROR
            // VBoxManage: error: Appliance import failed
            // VBoxManage: error: Machine settings file '/Users/cjparnin/VirtualBox VMs/hello/hello.vbox' already exists
            let MachineSettingPath = path.join(require('os').userInfo().homedir, `VirtualBox\ VMs/${name}/${name}.vbox`);
            if (await fs.exists(MachineSettingPath)) {
                reject(`Machine setting file ${MachineSettingPath} already exists`);
            }
            resolve();
        })
    }

    async stop(name) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} controlvm ${name} savestate`, (error, stdout, stderr) => {
                if(error ) {
                    console.error(`exec error: stop`);
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                resolve("Stopped.");
            });
        });
    }

    async delete(name) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} unregistervm ${name} --delete`, (error, stdout, stderr) => {
                if(error) {
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                resolve("Deleted.");
            });
        });
    }

    async info(name) {

    }

}

// Export
module.exports = VBoxProvider;