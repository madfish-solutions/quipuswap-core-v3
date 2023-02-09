import { sleep } from '../tests/helpers/utils';
import fs from 'fs';

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
async function killSandbox() {
  try {
    await spawn('yarn', ['stop-sandbox']);
  } catch (e) {}
}

const MAX_RETRIES = 5;

let failed = 0;

const safeTest = async (file: string) => {
  await killSandbox();
  await sleep(2000);

  try {
    await spawn('yarn', ['start-sandbox']);
  } catch (e) {
    await sleep(1000);
    await safeTest(file);
  }

  await sleep(8000);
  const testProcess = spawn('ts-mocha', ['--bail', `tests/${file}`], {
    stdio: 'inherit',
  });

  await testProcess
    .then(async () => {
      console.log('Test passed');
      failed = 0;
      await killSandbox();
    })
    .catch(async err => {
      if (failed >= MAX_RETRIES) {
        console.log('Test failed');
        throw err;
      } else {
        failed += 1;
        await safeTest(file);
      }
    });
};

async function main() {
  for (const file of getContractsList('tests')) {
    await safeTest(file);
  }
}

if (require.main === module) {
  main();
}
