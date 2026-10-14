import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
mock('sdkmanager', 'printf "sdkmanager %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = --licenses ]; then cat >/dev/null; fi\nexit "${SDK_STATUS:-0}"\n');
try {
  for (const [free,expected] of [[6657,1],[10239,1],[10240,0],[16000,0]]) {
    const env={...process.env,PATH:bin+':'+process.env.PATH,HOME:home,ANDROID_AVD_HOME:join(home,'avd'),FREE_MIB:String(free),COMMAND_LOG:log};
    const result=spawnSync('bash',[script,'check'],{cwd:directory,env,encoding:'utf8',timeout:5000});
    assert.equal(result.status,expected,result.stderr);
  }
  const env={...process.env,PATH:bin+':'+process.env.PATH,HOME:home,ANDROID_AVD_HOME:join(home,'avd'),ANDROID_SDK_ROOT:sdk,
    FREE_MIB:'16000',COMMAND_LOG:log,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_ENVIRONMENT:'github-hosted'};
  // Consume only one line for the mock license prompt to avoid waiting for infinite yes.
  mock('sdkmanager', 'printf "sdkmanager %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = --licenses ]; then read line; exit 0; fi\nexit "${SDK_STATUS:-0}"\n');
  let result=spawnSync('bash',[script,'prepare'],{cwd:directory,env,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
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
  assert.equal(result.status,0,result.stderr);

  writeFileSync(join(directory,'android','app.gradle'),'android { externalNativeBuild { cmake {} } }');
  writeFileSync(log,'');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
  assert(!readFileSync(log,'utf8').includes(sdk+'/ndk'),'NDK must be retained for native builds');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env:{...env,RUNNER_ENVIRONMENT:'self-hosted'},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1,'cleanup must refuse self-hosted machines');
  result=spawnSync('bash',[script,'prepare'],{cwd:directory,env:{...env,SDK_STATUS:'7'},encoding:'utf8',timeout:5000});
  assert.equal(result.status,7,'SDK installation failure must propagate');
  console.log('PASS emulator host: shell syntax, actual-space threshold, safe hosted-only cleanup, conditional NDK retention, SDK failure propagation');
} finally { rmSync(directory,{recursive:true,force:true}); }
