const fs            = require('fs');
const path          = require('path');
const Client        = require('ssh2').Client;
const scp2          = require('scp2');
const isPortAvailable = require('is-port-available');

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
    for( let prop in properties )
    {
      if( prop.indexOf('Forwarding(') >= 0 )
      {
        try{
          ports.push( parseInt( properties[prop].split(',')[3]) );
        }
        catch(e)
        {
          console.error(e);
        }
      }
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


module.exports.sshExec = async function sshExec (cmd, sshConfig, timeout = 5000, verbose = false, options = { count: 20 }) {
  let stdout = '';
  let stderr = '';

  return new Promise((resolve, reject) => {
      let c = new Client();
      const self = this;
      c.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
          // iterate prompts, and figure out the answers - for OSX there should only be one prompt
          // with the prompt value being "Password:"
          //finish(['my-password']);
          console.log( `${name}` `${prompts}`);
          throw new Error(`Received unexpected keyboard prompt when connecting: ${instructions}`);
      })
      .on('ready', () => {
              c.exec(cmd, options, (err, stream) => {
                  if (err) {
                      console.error(err);
                      reject(err);
                  }
                  stream
                      .on('close', (code, signal) => {
                          if (verbose) {
                              console.log("closing stream");
                          }
                          c.end();
                          resolve({stdout, stderr});
                      })
                      .on('data', (data) => {
                          if (verbose) {
                              process.stdout.write(data);
                          }
                          stdout += data;
                          if (options.setup && data.includes(options.setup.wait_for)) {
                              c.end();
                              resolve({stdout, stderr});
                          }
                      })
                      .stderr.on('data', (data) => {
                          if (verbose) {
                              process.stderr.write(data);
                          }
                          stderr += data;
                      });
              });
      }).on('error', (err) => {

              console.error(err.message);

              if (err.message.indexOf('ECONNRESET') >= 0 || err.message.indexOf('ECONNREFUSED') >= 0 || err.message.indexOf('Timed out while waiting for handshake') >= 0) {
                  // Give vm 1 more seconds to get ready
                  console.error(`Waiting 1 second for ${sshConfig.hostname}:${sshConfig.port} to be ready`);
                  setTimeout(async () => {
                      resolve(await self.sshExec(cmd, sshConfig, timeout, verbose, options));
                  }, 1000);
              } else {
                  reject(err);
              }
      })
      .connect({
          host: sshConfig.hostname, // this defaults to localhost if not privided
          port: sshConfig.port,
          username: sshConfig.user,
          privateKey: fs.readFileSync(sshConfig.private_key),
          readyTimeout: timeout,
          tryKeyboard: true
      });
  });
}