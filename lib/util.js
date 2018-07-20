const fs            = require('fs');
const path          = require('path');
const Client        = require('ssh2').Client;
const scp2          = require('scp2');

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
          print.error(`Failed to configure ssh keys: ${err}`);
          reject();
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports.sshExec = async function sshExec(cmd, sshConfig, verbose) {
    return new Promise((resolve, reject) => {
        var c = new Client();
          c
            .on('ready', function() {
                c.exec(cmd, function(err, stream) {
                    if (err){
                        print.error(err);
                    }
                    stream
                        .on('close', function(code, signal) {
                            c.end();
                            resolve();
                        })
                        .on('data', function(data) {
                            if( verbose )
                            {
                                console.log('STDOUT: ' + data);
                            }
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
                privateKey: fs.readFileSync(sshConfig.private_key)
            });
    });
}
