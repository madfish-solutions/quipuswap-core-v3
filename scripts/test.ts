import { getPort, sleep } from '../tests/helpers/utils';
import fs from 'fs';
import path from 'path';

const { spawn } = require('child-process-promise');

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

async function killSandbox() {
  try {
    await spawn('yarn', ['stop-sandbox']);
  } catch (e) {}
}

const async = require('async');
const MAX_RETRIES = 3;
let passing = 0;
let pending = 0;
let testsCompleted = 0;
let failed = 0;

// const testQueue = async.queue(async (file, callback) => {
//   const PORT = getPort(file);
//   console.log(file);
//   await killSandbox(spawn);

//   await sleep(3000);
//   const startSandbox = spawn('docker', [
//     'run',
//     '--rm',
//     '--name',
//     `my-sandbox-${file}`,
//     '-e',
//     'block_time=1',
//     '--detach',
//     '-p',
//     `${PORT}:20000`,
//     'oxheadalpha/flextesa:20221123',
//     'kathmandubox',
//     'start',
//   ]);
//   await startSandbox
//     .then(async () => {
//       await sleep(10000);

//       let log = '';
//       const testProcess = spawn('ts-mocha', ['--bail', `tests/${file}`], {
//         stdio: 'pipe',
//       });

//       testProcess.childProcess.stdout.on('data', data => {
//         const row = data.toString();

//         log += colorText(row);
//         if (row.includes('passing')) {
//           const passingTests = Number(row.split('passing')[0]);
//           passing += passingTests;
//         }
//         if (row.includes('pending')) {
//           const pendingTests = Number(row.split('pending')[0]);
//           pending += pendingTests;
//         }
//       });

//       testProcess
//         .then(async data => {
//           // success
//           testsCompleted++;
//           console.log(log);
//           if (testsCompleted === getContractsList('tests').length) {
//             console.log('All tests are completed!\n');
//             console.log(colorText(`${passing} passing`));
//             console.log(colorText(`${pending} pending\n`));
//           }
//           await killSandbox(file, spawn);
//           callback();
//         })
//         .catch(async err => {
//           const fails = faliedTests[file];
//           if (fails.failCount >= MAX_RETRIES) {
//             throw err;
//           } else {
//             fails.failCount += 1;
//             testQueue.push(file);
//             console.log(`Test failed: ${err.message}`);
//             callback();
//           }
//         });
//     })
//     .catch(err => {
//       console.log(`Sandbox start failed: ${err.message}`);
//       callback();
//     });
// }, 1); // set the concurrency to 2

const safeTest = async (file: string) => {
  await killSandbox();
  await sleep(1000);

  const startSandbox = spawn('yarn', ['start-sandbox']);
  await startSandbox
    .then(async () => {
      await sleep(7000);
      const testProcess = spawn('ts-mocha', ['--bail', `tests/${file}`], {
        stdio: 'inherit',
      });

      await testProcess
        .then(async () => {
          failed = 0;
          await killSandbox();
        })
        .catch(async err => {
          await safeTest(file);
          if (failed >= MAX_RETRIES) {
            throw err;
          } else {
            failed += 1;
            console.log(`Test failed: ${err.message}`);
          }
        });
    })
    .catch(async err => {
      console.log(`Sandbox start failed: ${err.message}`);
      await safeTest(file);
    });
};

// getContractsList('tests').forEach(async file => {
//   await safeTest(file);
// });

//testQueue.drain(() => {});

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
    const count = Number(text.split('passing')[0]);
    coloredText = coloredText.replace(
      `${count} passing`,
      `\x1b[32m${count} passing\x1b[0m`,
    );
  }
  if (text.includes('pending')) {
    const count = Number(text.split('pending')[0]);
    coloredText = coloredText.replace(
      `${count} pending`,
      `\x1b[34m${text}\x1b[0m`,
    );
  }

  return coloredText;
}

async function main() {
  for (const file of getContractsList('tests')) {
    await safeTest(file);
  }
}

if (require.main === module) {
  main();
}
