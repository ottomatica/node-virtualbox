/**
 * @module virtualbox
 */

const Bluebird        = require('bluebird');

const VBoxProvider = require('./lib/VBoxProvider');

module.exports = async function(options = {}) {

    // Set default language
    //options.language = options.language || 'python';
    let provider = new VBoxProvider();
    await provider.provision(options.vmname, options.ovf, options.verbose);

    //return Bluebird.fromCallback(cb => generator.generate(JSON.stringify(data), cb));

};