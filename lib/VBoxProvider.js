/**
 * @module lib/VBoxProvider
 */

const execute = require('./commands/execute');

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

    async customize(name, vboxnet, ssh_port, verbose)
    {
        // modifyvm ${VM} --uart1 0x3f8 4 --uartmode1 disconnected
        await execute("modifyvm", `${name}  --uart1 0x3f8 4 --uartmode1 disconnected`, verbose);
        
        // NIC1
        await execute("modifyvm", `${name} --nic1 nat`, verbose);
        await execute("modifyvm", `${name} --nictype1 virtio`, verbose);

        // NIC2
        // let VBOXNET='vboxnet0' || vboxnet; // TODO: should create a new one and use that?
        // await execute("modifyvm", `${name} --hostonlyadapter2 ${VBOXNET}`, verbose);
        // await execute("modifyvm", `${name} --nic2 hostonly`, verbose);
        // await execute("modifyvm", `${name} --nictype2 virtio`, verbose);

        // port forwarding
        let SSH_PORT = ssh_port || 2002;
        await execute("modifyvm", `${name} --natpf1 "guestssh,tcp,,${SSH_PORT},,22"`, verbose);

    }

    async start(name, verbose) {
        await execute("startvm", `${name} --type headless`, verbose);
    }

    async check()
    {
        // Should check if box already exists.
        // Progress state: VBOX_E_FILE_ERROR
        // VBoxManage: error: Appliance import failed
        // VBoxManage: error: Machine settings file '/Users/cjparnin/VirtualBox VMs/hello/hello.vbox' already exists
    }

}

// Export
module.exports = VBoxProvider;