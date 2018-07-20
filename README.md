# node-virtualbox

This is a simple tool that helps provision basic VirtualBox virtual machines with sane defaults.

Example run:

```
node bin.js --provision --vmname "hello" --ovf <BOX_PATH> --ip <IP> --verbose
```

Example location of box location: ~/.vagrant.d/boxes/ubuntu-VAGRANTSLASH-xenial64/20180620.0.0/virtualbox/box.ovf

Create a new VM in VirtualBox (reference bash script).

```
./create.sh
```

Ssh into instance.
```
ssh -i ~/.vagrant.d/insecure_private_key -p 2002 -o StrictHostKeyChecking=no IdentitiesOnly=yes vagrant@127.0.0.1
```


Check if port is in use.
```
lsof -n -i4TCP:$PORT | grep LISTEN
```