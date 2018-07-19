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

    async customize()
    {

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