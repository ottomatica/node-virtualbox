# node-virtualbox

This is a simple tool that helps provision basic VirtualBox virtual machines with sane defaults.

Example run:

```
node bin.js --provision --vmname "hello" --ip 172.168.0.55 --verbose
```

Create a new VM in VirtualBox (reference bash script).

```
./create.sh
```

Ssh into instance.
```
ssh -i config/insecure_private_key -p 2002 -o StrictHostKeyChecking=no IdentitiesOnly=yes vagrant@127.0.0.1
```


Check if port is in use.
```
lsof -n -i4TCP:$PORT | grep LISTEN
```