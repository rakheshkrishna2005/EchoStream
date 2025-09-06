import cluster from 'node:cluster';
import os from 'node:os';

if (cluster.isPrimary) {
  const num = Number(process.env.WEB_CONCURRENCY || os.cpus().length);
  console.log(`Primary ${process.pid} starting ${num} workers`);
  for (let i = 0; i < num; i++) cluster.fork();

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died; forking a new one`);
    cluster.fork();
  });
} else {
  // Import the normal server which sets up Express and Socket.IO
  await import('./server.js');
}
