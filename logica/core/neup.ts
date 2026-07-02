/*
::neup.documentation::neup-logica-cli

Local Logica command dispatcher.

Run commands through `npm run neup -- <command>` or `npm run neup <command>`.
The dispatcher keeps mapping commands static and does not execute the Next.js
application.

::end
*/

import { mapPermission } from './commands/mapPermission';

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'mapPermission':
      await mapPermission();
      return;
    default:
      console.error(`Unknown neup command: ${command ?? '(none)'}`);
      console.error('Available commands: mapPermission');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
