/**
 * @module lib/VBoxProvider
 */

const execute = require('./commands/execute');
const execSync = require('child_process').execSync;
const exec = require('child_process').exec;
const { promisify } = require('util');
const execAsync = promisify(exec);
const mustache = require('mustache');
const fs = require('fs-extra');
const path = require('path');
const ipUtil = require('ip');
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
        let adapter = (await this.hostonlyifs()).filter(e => e.IPAddress === this._calculateGateway(ip))[0];
        if (adapter)
            VBOXNET = adapter.Name;
        else {
            let stdout = (await execAsync(`${VBexe} hostonlyif create`)).stdout;
            VBOXNET = stdout.substr(stdout.indexOf(`'`) + 1, stdout.lastIndexOf(`'`) - stdout.indexOf(`'`) - 1);
            console.log('created adapter:', VBOXNET);
        }
        await execute("hostonlyif", `ipconfig "${VBOXNET}" --ip ${this._calculateGateway(ip)}`);
        
        await execute("modifyvm", `${name} --hostonlyadapter2 "${VBOXNET}"`, verbose);
        await execute("modifyvm", `${name} --nic2 hostonly`, verbose);
        await execute("modifyvm", `${name} --nictype2 virtio`, verbose);

        // port forwarding
        let SSH_PORT = ssh_port || 2002;
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${SSH_PORT},,22"`, verbose);
    }

    async start(name, verbose) {
        await execute("startvm", `${name} --type headless`, verbose);
    }

    // setting /etc/network/interfaces
    async postSetup(ip, sshKeyPath, verbose) {
        let interfacesPath = path.resolve(__dirname, '../config/interfaces.mustache');

        // render and create interfaces in /tmp/interfaces
        let interfaces = mustache.render((await fs.readFile(interfacesPath)).toString(), {ip});
        await fs.writeFile(`/tmp/interfaces`, interfaces);
        
        // cp /tmp/interfaces vm:/tmp/interfaces
        let scpInterfaces = await execAsync(`scp -q -i ${sshKeyPath}  -P 2002 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -F /dev/null -o IdentitiesOnly=yes  /tmp/interfaces vagrant@127.0.0.1:/tmp/interfaces`);
        if(verbose)
            console.log(scpInterfaces.stdout);
        if(scpInterfaces.stderr)
            throw `failed to generate interfaces configuration, ${scpInterfaces.stderr}`;

        // mv vm:/tmp/interfaces /etc/network/interfaces, 
        // sudo systemctl restart networking
        // ifdown ens0p8; ifup ens0p8
        let sshApplyInterfaces = await execAsync(`ssh -q -i ${sshKeyPath} -p 2002 -o StrictHostKeyChecking=no -F /dev/null -o IdentitiesOnly=yes vagrant@127.0.0.1 'bash -c "sudo cp /tmp/interfaces /etc/network/interfaces && sudo systemctl restart networking && sudo ifdown enp0s8 && sudo ifup enp0s8"'`);
        if(verbose)
            console.log(sshApplyInterfaces.stdout);
        if(sshApplyInterfaces.stderr)
            throw `failed to copy interfaces configuration, ${sshApplyInterfaces.stderr}`;
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
                stdout.split('\n\n').forEach(adapters => {
                    if(adapters.length > 0) {
                        let adapter = {};
                        adapters.split('\n').forEach(line => {
                            if(line.length > 0) { 
                                line = line.replace(/\s/g, ''); // remove white spaces
                                let splitIdx = line.indexOf(':');
                                adapter[line.substr(0, splitIdx)] = line.substr(splitIdx+1);
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

    }

    async delete(name) {

    }

    async info(name) {

    }

}

// Export
module.exports = VBoxProvider;