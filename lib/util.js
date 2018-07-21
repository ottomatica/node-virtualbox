const fs            = require('fs');
const path          = require('path');
const Client        = require('ssh2').Client;
const scp2          = require('scp2');
const isPortAvailable = require('is-port-available');;

// Adapted from https://stackoverflow.com/a/40686853/547112
module.exports.mkDirByPathSync = function mkDirByPathSync(targetDir, {isRelativeToScript = false} = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';
  
    targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(baseDir, parentDir, childDir);
      try {
        if( !fs.existsSync(curDir))
        {
          fs.mkdirSync(curDir);
        }
      } catch (err) {
        if (err.code !== 'EEXIST') {
          throw err;
        }
      }
  
      return curDir;
    }, initDir);
  }

module.exports.findAvailablePort = async function findAvailablePort(provider, verbose, startPort=2002,endPort=2999)
{
  let port = startPort;
  let blackListPorts = await module.exports.getPortsUsedByVMs(provider);
  if( verbose )
  {
    console.log(`Searching between ports ${startPort} and ${endPort} for ssh on localhost for this vm.`);
    console.log(`Excluding the following ports already used by VirtualBox VMS: ${blackListPorts}`);
  }
  while( port <= endPort )
  {
    if( !blackListPorts.includes(port) )
    {
      var status = await isPortAvailable(port);
      if(status) 
      {
        console.log(`Port ${port} is available for ssh on localhost!`);
        return port;
      }
    }
    port++;
  }
  throw new Error(`Could not find available port between ${startPort} and ${endPort}`);
}

// A VM could be powered off but assigned a port in its NAT/fowards for ssh/etc.
module.exports.getPortsUsedByVMs = async function getPortsUsedByVMs(provider)
{
  let vms = await provider.list();
  let ports = [];
  for( var vm of vms )
  {
    let properties = await provider.info(vm.name);
    if( properties.hasOwnProperty('Forwarding(0)') )
    {
      ports.push( parseInt( properties['Forwarding(0)'].split(',')[3]) );
    }
  }
  return ports;
}

module.exports.scp = async function scp(src, dest, destSSHConfig) {
  return new Promise((resolve, reject) => {
    scp2.scp(
      src, {
        host: '127.0.0.1',
        port: destSSHConfig.port,
        username: destSSHConfig.user,
        privateKey: fs.readFileSync(destSSHConfig.private_key, 'utf8'),
        path: dest
      },
      async function (err) {
        if (err) {
          console.error(`Failed to configure ssh keys: ${err}`);
          reject();
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports.sshExec = async function sshExec(cmd, sshConfig, timeout=20000, verbose) {
    let buffer = "";
    return new Promise((resolve, reject) => {
        var c = new Client();
          c
            .on('ready', function() {
                c.exec(cmd, function(err, stream) {
                    if (err){
                        console.error(err);
                    }
                    stream
                        .on('close', function(code, signal) {
                            c.end();
                            resolve(buffer);
                        })
                        .on('data', function(data) {
                            if( verbose )
                            {
                                console.log('STDOUT: ' + data);
                            }
                            buffer += data;
                        })
                        .stderr.on('data', function(data) {
                            console.log('STDERR: ' + data);
                            reject();
                        });
                });
            })
            .connect({
                host: '127.0.0.1',
                port: sshConfig.port,
                username: sshConfig.user,
                privateKey: fs.readFileSync(sshConfig.private_key),
                readyTimeout: timeout
            });
    });
}
