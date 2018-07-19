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
    await provider.customize(options.vmname, undefined, undefined, options.verbose);
    await provider.start(options.vmname, options.verbose);
    //return Bluebird.fromCallback(cb => generator.generate(JSON.stringify(data), cb));

    // basic index file can be something like:
    // • check() to verify whether things like vmname already is running/or box exists
    // • provision() to start vm
    // • customize() to run modifyvm stuff
    // • start() -- optionally start()
    // • post-setup() things that will require ssh.exec (setup /etc/networking/interfaces)


};