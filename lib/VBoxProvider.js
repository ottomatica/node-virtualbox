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

const isPortAvailable = require('is-port-available');

class VBoxProvider {

    /**
     * Get default run command.
     *
     * @param   {String} name Name of virtual machine.
     * @param   {String} ovf  Path of image to clone/import.
     * @returns {Object}      Promise.
     */
    async provision(name, cpus, mem, ovf, iso, verbose) {
        await execute("import", `"${ovf}" --vsys 0 --vmname ${name}`, verbose);
        await execute("modifyvm", `"${name}" --memory ${mem} --cpus ${cpus}`, verbose);
        if(iso)
            await execute("storageattach", `${name} --storagectl IDE --port 0 --device 0 --type dvddrive --medium "${iso}"`)
    }

    _calculateGateway(ip, mask='255.255.255.0'){
        let networkAddress = ipUtil.mask(ip, mask);
        return ipUtil.cidrSubnet(networkAddress + '/26').firstAddress;
    }

    async micro(name, cpus, mem, iso, ssh_port, sshKeyPath, syncs, disk, verbose) {
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
        
        // Disks
        if( disk )
        {
            let diskPath = path.join(os.homedir(),'.baker','boxes',`${name}-disk.vdi`);
            let diskSize = 32768;
            if( !fs.existsSync(diskPath) )
            {
                //let rawDisk = "\\\\.\\PhysicalDrive0";
                //await execute("internalcommands", `createrawvmdk -filename ${diskPath} -rawdisk "${rawDisk}"`, verbose);
                // --variant Fixed
                await execute("createmedium", `disk --format VDI --filename "${diskPath}" --size ${diskSize} `, verbose);
                //await execute("modifymedium", `${diskPath} --type writethrough`, verbose);
            }

            await execute("storagectl", `"${name}" --name "SATA" --add sata`, verbose);
            await execute("storageattach", `${name} --storagectl "SATA" --port 2 --device 0 --type hdd --medium "${diskPath}"`, verbose);
        }

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

        await this.start(name, verbose);

        // post setup
        if( disk )
        {
            // format new disk to be ext4
            let sshConfig = {port: ssh_port, user: 'root', private_key: sshKeyPath};
            //let cmd = 'echo -e "o\nn\np\n1\n\n\nw" | fdisk /dev/sda && /sbin/mkfs.ext4 /dev/sda1';
            let cmd = `/sbin/mkfs.ext4 /dev/sda; mount -t ext4 /dev/sda /mnt/disk`;
            console.log('Formating virtual drive');

            await util.sshExec(cmd, sshConfig, 60000, verbose).catch( e => {console.log(e)});;
        }
    }

    async customize(name, ip, ssh_port, forward_ports=[], syncs, verbose) {
        // modifyvm ${VM} --uart1 0x3f8 4 --uartmode1 disconnected
        await execute("modifyvm", `${name}  --uart1 0x3f8 4 --uartmode1 disconnected`, verbose);
        
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

        // NIC1 =======
        await execute("modifyvm", `${name} --nic1 nat`, verbose);
        await execute("modifyvm", `${name} --nictype1 virtio`, verbose);

        if( ip )
        {
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
        }

        // port forwarding for ssh
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${ssh_port},,22"`, verbose);

        // port forwarding
        forward_ports.forEach(async function (port) {
            let splitPort = String(port).split(':');
            let guestPort = splitPort[0];
            let hostPort = splitPort[1] || splitPort[0];
            await execute("modifyvm", `${name} --natpf1 "${port},tcp,,${hostPort},,${guestPort}"`, verbose);
        });
    }

    async start(name, verbose) {
        // For unlock any session.
        await execute("startvm", `${name} --type emergencystop`, verbose).catch(e => e);
        // Real start.
        await execute("startvm", `${name} --type headless`, verbose);
    }

    async waitForConnection(sshInfo, tries=0)
    {
        try {
            let cmd = `echo "waiting to start"`;
            await util.sshExec(cmd, sshInfo, 60000);
        } catch (error) {
            if( tries > 5 )
            {
                throw `Timed out.`;
            }
            this.waitForConnection(sshInfo,tries++);
        }
    }

    // setting /etc/network/interfaces
    async postSetup(vmname, ip, port, sshKeyPath, newSSHKeyPath, syncs, verbose) {
        let interfacesPath = path.resolve(__dirname, '../config/interfaces.mustache');

        // render and create interfaces in /tmp/interfaces
        let tmpFile = path.join(os.tmpdir(),'interfaces');
        let interfaces = mustache.render((await fs.readFile(interfacesPath)).toString(), {ip});
        await fs.writeFile(tmpFile, interfaces);
        
        await this.waitForConnection({port, user: 'vagrant', private_key: sshKeyPath});

        if (ip )
        {
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

    async saveState(name) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} controlvm ${name} savestate`, (error, stdout, stderr) => {
                if(error && stderr.indexOf('VBOX_E_OBJECT_NOT_FOUND') == -1) {
                    console.error(`exec error: stop`);
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                resolve("");
            });
        });
    }

    async stop(name) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} controlvm ${name} poweroff soft`, (error, stdout, stderr) => {
                if(error && stderr.indexOf('VBOX_E_OBJECT_NOT_FOUND') == -1) {
                    console.error(`exec error: stop`);
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                resolve("");
            });
        });
    }

    async delete(name) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} unregistervm ${name} --delete`, (error, stdout, stderr) => {
                if(error && stderr.indexOf('VBOX_E_OBJECT_NOT_FOUND') == -1) {
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                resolve("");
            });
        });
    }

    async info(vmname) {
        return new Promise(function (resolve, reject) {   
            exec(`${VBexe} showvminfo ${vmname} --machinereadable`, (error, stdout, stderr) => {
                if(error && stderr.indexOf('VBOX_E_OBJECT_NOT_FOUND') != -1) {
                    resolve({VMState:'not_found'});
                }
                else if( error )
                {
                    console.error(`=> ${error}, ${stderr}`);
                    reject(error);
                }
                else
                {
                    let properties = {};
                    let lines = stdout.split('\n');
                    for (let i = 0; i < lines.length-1; i++) {
                        let lineSplit = lines[i].split('=');
                        let name= lineSplit[0].trim();
                        let id = lineSplit[1].trim();
                        properties[name]=id;
                    }
                    resolve(properties);
                }
            });
        });
    }

    async getState(name) {
        let vmInfo = await this.info(name);
        return vmInfo.VMState.replace(/"/g,'');
    }

    async expose(name, port, verbose) {

        let hostPort=port, guestPort=port;
        if( port.indexOf(':') > 0 )
        {
            [hostPort,guestPort] = port.split(':');
        }

        var status = await isPortAvailable(hostPort);
        if(!status) 
        {
            throw new Error(`The port ${hostPort} is not available for use!`)
        }

        try
        {
            if( await this.getState(name) == "running" )
            {
                await execute("controlvm", `${name} natpf1 "${hostPort},tcp,,${hostPort},,${guestPort}"`, verbose);
            }
            else
            {
                await execute("modifyvm", `${name} --natpf1 "${hostPort},tcp,,${hostPort},,${guestPort}"`, verbose);
            }
        }
        catch(err)
        {
            if( err.message.indexOf("name already exists") == -1 )
            {
                throw new Error(err);
            }
        }
        return `Added exposed port ${hostPort} => ${guestPort} on ${name}`;
    }

}

// Export
module.exports = VBoxProvider;