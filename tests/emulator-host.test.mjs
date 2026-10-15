import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('../scripts/prepare-emulator-host.sh', import.meta.url));
const syntax=spawnSync('bash',['-n',script],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const directory=mkdtempSync(join(tmpdir(),'wv-emulator-host-'));
const bin=join(directory,'bin'), home=join(directory,'home'), sdk=join(directory,'sdk'), log=join(directory,'commands');
mkdirSync(bin);mkdirSync(join(sdk,'ndk'),{recursive:true});mkdirSync(join(directory,'android'));
function mock(name,content) { writeFileSync(join(bin,name),'#!/bin/sh\n'+content,{mode:0o755}); }
mock('df', 'printf "Filesystem 1M-blocks Used Available Use%% Mounted\\nfixture 72000 10000 %s 50%% /\\n" "$FREE_MIB"\n');
// Never perform real cleanup or network requests in regression tests.
mock('sudo', 'printf "sudo %s\\n" "$*" >> "$COMMAND_LOG"\n');
// This Linux CI fixture must never inherit the runner's real Android SDK or
// command-line-tools PATH. Both SDK variables point exclusively at the fixture.
const fixtureEnv={PATH:bin+':/usr/bin:/bin',HOME:home,
  ANDROID_AVD_HOME:join(home,'avd'),ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,
  COMMAND_LOG:log};
function assertExit(result,expected,label='fixture command') {
  assert.equal(result.status,expected,
    `${label}: error=${result.error?.message || 'none'} signal=${result.signal || 'none'}\n${result.stdout || ''}\n${result.stderr || ''}`);
}
try {
  for (const [free,expected] of [[6657,1],[10239,1],[10240,0],[16000,0]]) {
    const env={...fixtureEnv,FREE_MIB:String(free)};
    const result=spawnSync('bash',[script,'check'],{cwd:directory,env,encoding:'utf8',timeout:5000});
    assertExit(result,expected);
  }
  const env={...fixtureEnv,
    FREE_MIB:'16000',COMMAND_LOG:log,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted'};
  // Consume only one line for the mock license prompt to avoid waiting for infinite yes.
  mock('sdkmanager', 'printf "sdkmanager %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = --licenses ]; then read line; exit 0; fi\nexit "${SDK_STATUS:-0}"\n');
  let result=spawnSync('bash',[script,'prepare'],{cwd:directory,env,encoding:'utf8',timeout:5000});
  assertExit(result,0);
  let commands=readFileSync(log,'utf8');
  assert(commands.includes('system-images;android-30;google_apis;x86_64'));
  assert(commands.includes('rm -rf -- '+sdk+'/ndk'));
  assert(commands.includes('build-tools;37.0.0'));
  // Resolve the hosted SDK executable even when sdkmanager is not on PATH.
  const sdkBin=join(sdk,'cmdline-tools','latest','bin');
  mkdirSync(sdkBin,{recursive:true});
  writeFileSync(join(sdkBin,'sdkmanager'),readFileSync(join(bin,'sdkmanager')),{mode:0o755});
  rmSync(join(bin,'sdkmanager'));
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env,encoding:'utf8',timeout:5000});
  assertExit(result,0);

  writeFileSync(join(directory,'android','app.gradle'),'android { externalNativeBuild { cmake {} } }');
  writeFileSync(log,'');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env,encoding:'utf8',timeout:5000});
  assertExit(result,0);
  assert(!readFileSync(log,'utf8').includes(sdk+'/ndk'),'NDK must be retained for native builds');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env:{...env,RUNNER_ENVIRONMENT:'self-hosted'},encoding:'utf8',timeout:5000});
  assertExit(result,1,'cleanup must refuse self-hosted machines');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env:{...env,SDK_STATUS:'7'},encoding:'utf8',timeout:5000});
  assertExit(result,7,'SDK installation failure must propagate');
  // Repeat the entire fixture with a conflicting inherited SDK, like the hosted
  // runner. The sentinel proves that no real/inherited SDK command is executed.
  if (process.env.WV_EMULATOR_ISOLATION_CHILD !== '1') {
    const foreignSdk=join(directory,'foreign-sdk');
    const foreignBin=join(foreignSdk,'cmdline-tools','latest','bin');
    const sentinel=join(directory,'unexpected-sdk-use');
    mkdirSync(foreignBin,{recursive:true});
    writeFileSync(join(foreignBin,'sdkmanager'),
      `#!/bin/sh\ntouch "${sentinel}"\nexit 93\n`,{mode:0o755});
    const nested=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{
      env:{...process.env,ANDROID_HOME:foreignSdk,ANDROID_SDK_ROOT:foreignSdk,
        ANDROID_AVD_HOME:foreignSdk,SDK_STATUS:'99',
        PATH:foreignBin+':'+process.env.PATH,WV_EMULATOR_ISOLATION_CHILD:'1'},
      encoding:'utf8',timeout:30000,
    });
    assertExit(nested,0,'conflicting inherited SDK regression');
    assert(!existsSync(sentinel),'inherited SDK must never be executed');
    console.log('PASS regression: inherited Android SDK, PATH and SDK_STATUS are isolated');
  }
  console.log('PASS emulator host: shell syntax, actual-space threshold, safe hosted-only cleanup, conditional NDK retention, SDK failure propagation');
} finally { rmSync(directory,{recursive:true,force:true}); }
