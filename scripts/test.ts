import { getPort, sleep } from '../tests/helpers/utils';
import fs from 'fs';
import path from 'path';

const { TezosToolkit } = require('@taquito/taquito');
const { spawn } = require('child-process-promise');

// const testFiles = [
//   '06-factory-test.spec.ts',
//   '00-position.spec.ts',
//   //'01-x-to-y.spec.ts',
//   '02-y-to-x.spec.ts',
// ];

const getContractsList = (testDir: string) => {
  let tests: string[] = [];

  fs.readdirSync(testDir).forEach(file => {
    if (file.endsWith('spec.ts')) {
      tests.push(`${file}`);
    }
  });

  return tests.map(file => file.slice(0, file.length));
};
const exec = require('child_process').exec;

async function checkAndKill(file: string, proc) {
  exec(`docker ps | grep my-sandbox-${file}`, async (err, stdout, stderr) => {
    if (stdout) {
      await proc('docker', ['kill', `my-sandbox-${file}`]);
    }
  });
}

getContractsList('tests').forEach(async (file: string) => {
  const PORT = getPort(file);
  //const through2 = require("through2");
  console.log(file);
  await spawn('docker', [
    'run',
    '--rm',
    '--name',
    `my-sandbox-${file}`,
    '-e',
    'block_time=1',
    '--detach',
    '-p',
    `${PORT}:20000`,
    'oxheadalpha/flextesa:20221123',
    'kathmandubox',
    'start',
  ]);
  await checkAndKill(file, spawn);

  await sleep(3000);
  const startSandbox = spawn('docker', [
    'run',
    '--rm',
    '--name',
    `my-sandbox-${file}`,
    '-e',
    'block_time=1',
    '--detach',
    '-p',
    `${PORT}:20000`,
    'oxheadalpha/flextesa:20221123',
    'kathmandubox',
    'start',
  ]);
  await startSandbox
    .then(async () => {
      console.log('Sandbox started');
      await sleep(10000);
      console.log('Starting tests');
      const testProcess = spawn('ts-mocha', ['--bail', `tests/${file}`], {
        stdio: 'inherit',
      });
      //testProcess.childProcess.stdout.write("fsdfsdfsd");
      let log = '';
      testProcess.childProcess.stdout.on('data', data => {
        log += colorText(data.toString());
      });
      await new Promise((resolve, reject) => {
        testProcess.childProcess.on('exit', resolve);
        testProcess.childProcess.on('error', reject);
      });
      const through2 = require('through2');
      console.log(log);
    })
    .catch(err => {
      console.log(`Sandbox start failed: ${err.message}`);
    });
  //await checkAndKill(file, spawn);
});

function colorText(text: string): string {
  let coloredText = text;
  if (text.includes('✔')) {
    coloredText = coloredText.replace('✔', '\x1b[32m✔\x1b[0m'); // green
  }

  if (text.includes('✔') || (text.includes('(') && text.includes('ms'))) {
    const startIndex = text.indexOf('✔') + 1;
    const endIndex = text.indexOf('(') - 1;
    if (startIndex < endIndex) {
      const grayText = text.substring(startIndex, endIndex);
      coloredText = coloredText.replace(
        grayText,
        '\x1b[90m' + grayText + '\x1b[0m',
      ); // gray
    }
    const time = text.substring(text.indexOf('(') + 1, text.indexOf('ms'));
    const timeInMs = parseInt(time);
    if (timeInMs < 100) {
      coloredText = coloredText.replace(
        `(${time}ms)`,
        '\x1b[32m' + `(${time}ms)` + '\x1b[0m',
      );
    } else if (timeInMs < 1000) {
      coloredText = coloredText.replace(
        `(${time}ms)`,
        '\x1b[33m' + `(${time}ms)` + '\x1b[0m',
      ); // yellow
    } else {
      coloredText = coloredText.replace(
        `(${time}ms)`,
        '\x1b[31m' + `(${time}ms)` + '\x1b[0m',
      ); // red
    }
  }
  if (text.includes('passing')) {
    coloredText = coloredText.replace('passing', '\x1b[32mpassing\x1b[0m');
  }
  if (text.includes('pending')) {
    coloredText = `\x1b[34m${text}\x1b[0m`;
  }

  return coloredText;
}
