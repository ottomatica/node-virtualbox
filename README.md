# VirtualBoxCtrl

Create a new VM in VirtualBox.

```
./check.sh
```

Ssh into instance.
```
ssh -i ~/.vagrant.d/insecure_private_key -p 2002 -o StrictHostKeyChecking=no IdentitiesOnly=yes vagrant@127.0.0.1
```


Check if port is in use.
```
lsof -n -i4TCP:$PORT | grep LISTEN
```