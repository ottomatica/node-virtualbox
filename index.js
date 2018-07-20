/**
 * @module virtualbox
 */

const path          = require('path');
const fs            = require('fs');

const download      = require('download');
const tar           = require('tar');

const util          = require('./lib/util');
const VBoxProvider  = require('./lib/VBoxProvider');

module.exports = async function (options = {}) {
    let provider = new VBoxProvider();

    if(options.provision) {

        if( !options.ovf )
        {
            const boxesPath = path.join(require('os').userInfo().homedir, '.baker', 'boxes');
            const unpackPath = path.join(boxesPath, 'ubuntu-xenial');

            util.mkDirByPathSync(boxesPath);
            util.mkDirByPathSync(unpackPath);

            // download files if not available locally
            if (!(await fs.existsSync(path.join(unpackPath, 'box.ovf')))) {
                console.log("no --ovf specified, downloading latest ubuntu box!")
                await download('http://cloud-images.ubuntu.com/xenial/current/xenial-server-cloudimg-amd64-vagrant.box', boxesPath);
                await tar.x(  // or tar.extract(
                    {
                      file: path.join(boxesPath, 'xenial-server-cloudimg-amd64-vagrant.box'),
                      C: unpackPath
                    }
                );
                // Remove box
                fs.unlinkSync(path.join(boxesPath, 'xenial-server-cloudimg-amd64-vagrant.box'));
            }
            options.ovf = path.join(unpackPath, 'box.ovf');
        }

        try {
            await provider.check(options.ovf, options.vmname);
            await provider.provision(options.vmname, options.ovf, options.verbose);
            await provider.customize(options.vmname, options.ip, options.port, options.verbose);
            await provider.start(options.vmname, options.verbose);
            await provider.postSetup(options.ip, options.port, path.join(__dirname,'config/resources/insecure_private_key'), options.verbose);
        } catch (error) {
            console.error('=> exec error:', error);
        }
    }
    
    if(options.list)
        console.log(await provider.list());

    if(options.deleteCmd)
    {
        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --delete");
            process.exit(1);
        }        
        console.log(await provider.delete(options.vmname));
    }

    if(options.stopCmd)
    {
        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --stop");
            process.exit(1);
        }        
        console.log(await provider.stop(options.vmname));
    }


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
