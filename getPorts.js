import { exec } from 'child_process';


async function getPorts() {
    return new Promise((resolve, reject) => {
        exec("lsof -i -P -n | grep LISTEN | grep \"anytype\" | awk '{print $9}' | cut -d: -f2 | paste -sd \",\"", (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({ response: { anytype: stdout.split(',').map((port) => parseInt(port)) } });
        });
    });
}

export default getPorts;
