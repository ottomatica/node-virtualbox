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
    async provision(name, cpus, mem, ovf, iso, verbose) {
        await execute("import", `${ovf} --vsys 0 --vmname ${name}`, verbose);
        await execute("modifyvm", `"${name}" --memory ${mem} --cpus ${cpus}`, verbose);
        if(iso)
            await execute("storageattach", `${name} --storagectl IDE --port 0 --device 0 --type dvddrive --medium "${iso}"`)
    }

    _calculateGateway(ip, mask='255.255.255.0'){
        let networkAddress = ipUtil.mask(ip, mask);
        return ipUtil.cidrSubnet(networkAddress + '/26').firstAddress;
    }

    async micro(name, cpus, mem, iso, ssh_port, syncs, verbose) {
        await execute("createvm", `--name "${name}" --register`, verbose);
        await execute("modifyvm", `"${name}" --memory ${mem} --cpus ${cpus}`, verbose);
        await execute("storagectl", `"${name}" --name IDE --add ide`, verbose);
        await execute("storageattach", `${name} --storagectl IDE --port 0 --device 0 --type dvddrive --medium "${iso}"`, verbose);

        await execute("modifyvm", `${name}  --uart1 0x3f8 4 --uartmode1 disconnected`, verbose);
        
        // NIC1 =======
        await execute("modifyvm", `${name} --nic1 nat`, verbose);
        await execute("modifyvm", `${name} --nictype1 virtio`, verbose);
        
        // port forwarding
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${ssh_port},,22"`, verbose);
        
        // syncs
        if( syncs.length > 0 )
        {
            let count = 0;
            for( var sync of syncs )
            {
                let host = sync.split(';')[0];
                let guest = sync.split(';')[1];
                await execute("sharedfolder", `add ${name} --name "vbox-share-${count}" --hostpath "${host}" `, verbose);
                count++;
            }
        }

        this.start(name, verbose);
    }

    async customize(name, ip, ssh_port, forward_ports=[], syncs, verbose) {
        // modifyvm ${VM} --uart1 0x3f8 4 --uartmode1 disconnected
        await execute("modifyvm", `${name}  --uart1 0x3f8 4 --uartmode1 disconnected`, verbose);
        
        // NIC1 =======
        await execute("modifyvm", `${name} --nic1 nat`, verbose);
        await execute("modifyvm", `${name} --nictype1 virtio`, verbose);

        // NIC2 =======
        let VBOXNET = null;
        // check if any adapters with this ip :
        let gateway = this._calculateGateway(ip);
        let networks = (await this.hostonlyifs()).filter(e => e.IPAddress === gateway);
        if (networks.length > 0 )
        {
            VBOXNET = networks[0].Name;
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

        // port forwarding for ssh
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${ssh_port},,22"`, verbose);

        // port forwarding
        forward_ports.forEach(async function (port) {
            let splitPort = String(port).split(':');
            let guestPort = splitPort[0];
            let hostPort = splitPort[1] || splitPort[0];
            await execute("modifyvm", `${name} --natpf1 "${port},tcp,,${hostPort},,${guestPort}"`, verbose);
        });

        // syncs
        if( syncs.length > 0 )
        {
            let count = 0;
            for( var sync of syncs )
            {
                let host = sync.split(';')[0];
                let guest = sync.split(';')[1];
                await execute("sharedfolder", `add ${name} --name "${name}-${count}" --hostpath "${host}" `, verbose);
                count++;
            }
        }
    }

    async start(name, verbose) {
        await execute("startvm", `${name} --type headless`, verbose);
    }

    // setting /etc/network/interfaces
    async postSetup(vmname, ip, port, sshKeyPath, newSSHKeyPath, syncs, verbose) {
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

        // adding new ssh-key
        if(newSSHKeyPath){
            try {
                let newSSHKey = (await fs.readFile(newSSHKeyPath)).toString();
                let cmd = `echo "${newSSHKey}" >> ~/.ssh/authorized_keys`;
                await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000, verbose);
            } catch (error) {
                throw `failed to add new ssh key, ${error}`;
            }
        }

        await this.setupSyncFoldersOnGuest(vmname, syncs, port, sshKeyPath, verbose);
       
    }

    async setupSyncFoldersOnGuest(vmname, syncs, port, sshKeyPath, verbose)
    {
       // Handle sync folders
       if( syncs.length > 0 )
       {
           // Add vboxsf to modules so we can enable shared folders; ensure our user is in vboxsf group
           try {
               let LINE =  "vboxsf"; let FILE= '/etc/modules';
               let cmd = `(grep -qF -- "${LINE}" "${FILE}" || echo "${LINE}" | sudo tee -a "${FILE}"); sudo usermod -a -G vboxsf vagrant`;
               await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000, verbose);
           } catch (error) {
               throw `failed to setup shared folders, ${error}`;
           }

           // Add mount to /etc/fstab for every shared folder
           let count = 0;
           for( var sync of syncs )
           {
               let host = sync.split(';')[0];
               let guest = sync.split(';')[1];

               try {
                   let LINE=`${vmname}-${count}    ${guest}   vboxsf  uid=1000,gid=1000   0   0`; let FILE=`/etc/fstab`; 
                   let cmd = `sudo mkdir -p ${guest}; grep -qF -- "${LINE}" "${FILE}" || echo "${LINE}" | sudo tee -a "${FILE}"`;
                   await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000, verbose);
               } catch (error) {
                   throw `failed to add fstab entry for shared folder, ${error}`;
               }
               count++;
           }

           // Reload fstab
           try {
               let cmd = `sudo mount -a`;
               await util.sshExec(cmd, {port, user: 'vagrant', private_key: sshKeyPath}, 60000, verbose);
           } catch (error) {
               throw `failed to setup shared folders, ${error}`;
           }
           
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
                    list.push({name: name, id: id});
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

    async check(options) {
        let ovf =options.ovf;
        let name=options.vmname;
        let syncs=options.syncs;
        return new Promise(async function (resolve, reject) {
            // check if box already exists
            if(!(await fs.exists(path.resolve(ovf)))) {
                reject(`File not found ${ovf}`);
            }

            // Progress state: VBOX_E_FILE_ERROR
            // VBoxManage: error: Appliance import failed
            // VBoxManage: error: Machine settings file '/Users/cjparnin/VirtualBox VMs/hello/hello.vbox' already exists
            let MachineSettingPath = path.join(require('os').userInfo().homedir, `VirtualBox\ VMs/${name}/${name}.vbox`);
            if (await fs.exists(MachineSettingPath)) {
                reject(`Machine setting file ${MachineSettingPath} already exists.`);
            }

            // Verify correct format and existence of sync folders.
            for( var sync of syncs )
            {
                let atoms = sync.split(';');
                if( atoms.length !=2 )
                {
                    reject(`Invalid sync folder format. Please use this format: "<host_folder>;<guest_folder>".`);
                }
                let host = atoms[0];
                let guest = atoms[1];
                if (!await fs.exists(host)) {
                    reject(`The path ${host} does not exist on your host machine. Cannot create shared folder.`);
                }
            }

            // Verify new ssh key exists
            if (options.add_ssh_key) {
                const sshKeyExists = await fs.pathExists(options.add_ssh_key);
                if(!sshKeyExists)
                    reject(`No such file or directory: ${options.add_ssh_key}`);
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

    async info(vmname) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} showvminfo ${vmname} --machinereadable`, (error, stdout, stderr) => {
                if(error) {
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }

                let properties = {};
                let lines = stdout.split('\n');
                for (let i = 0; i < lines.length-1; i++) {
                    let lineSplit = lines[i].split('=');
                    let name= lineSplit[0].trim();
                    let id = lineSplit[1].trim();
                    properties[name]=id;
                }
                resolve(properties);
            });
        });
    }

}

// Export
module.exports = VBoxProvider;