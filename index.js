/**
 * @module virtualbox
 */



const download      = require('download');

const util          = require('./util.js');
const VBoxProvider  = require('./lib/VBoxProvider');

module.exports = async function (options = {}) {
    let provider = new VBoxProvider();

    if(options.provision) {

        if( !options.ovf )
        {
            const boxesPath = path.join(require('os').userInfo().homedir, '.baker', 'boxes');
            util.mkDirByPathSync(boxesPath);

            // download files if not available locally
            if (!(await fs.pathExists(path.join(boxesPath, 'xenial-server-cloudimg-amd64-vagrant.box')))) {
                await download('http://cloud-images.ubuntu.com/xenial/current/xenial-server-cloudimg-amd64-vagrant.box', boxesPath);
            }            
        }

        try {
            await provider.check(options.ovf, options.vmname);
            await provider.provision(options.vmname, options.ovf, options.verbose);
            await provider.customize(options.vmname, options.ip, undefined, options.verbose);
            await provider.start(options.vmname, options.verbose);
            await provider.postSetup(options.ip, '~/.vagrant.d/insecure_private_key', options.verbose);
        } catch (error) {
            console.error('=> exec error:', error);
        }
    }
    
    if(options.list)
        console.log(await provider.list());

    if(options.check){
        // console.log(await provider.hostonlyifs());

        // returns [] if it doesn't find adapter with this ip, otherwise a json object
        console.log((await provider.hostonlyifs()).filter(e => e.IPAddress === '192.168.56.1')); 
    }

    if(options.start)
        await provider.start(options.vmname, options.verbose);
    //return Bluebird.fromCallback(cb => generator.generate(JSON.stringify(data), cb));

    // basic index file can be something like:
    // • check() to verify whether things like vmname already is running/or box exists
    // • provision() to start vm
    // • customize() to run modifyvm stuff
    // • start() -- optionally start()
    // • post-setup() things that will require ssh.exec (setup /etc/networking/interfaces)
};
