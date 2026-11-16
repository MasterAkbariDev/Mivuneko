import importlib.util
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('computer_worker', Path(__file__).resolve().parents[2] / 'services/local-runtime/computer.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

@unittest.skipUnless(os.name == "nt", "Windows terminal runtime")
class TerminalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='mivuneko terminal ')
        self.root = Path(self.temp.name).resolve()
    def tearDown(self):
        self.temp.cleanup()
    def command(self, command, **fields):
        return worker.run_command({'workspace': str(self.root)}, {'command': command, **fields})
    def test_create_read_and_capture_output_in_folder_with_spaces(self):
        result = self.command("Set-Content -LiteralPath 'example.js' -Value 'console.log(42)'; Get-Content -LiteralPath 'example.js'")
        self.assertEqual(result['exitCode'], 0)
        self.assertIn('console.log(42)', result['stdout'])
        self.assertTrue((self.root/'example.js').is_file())
    def test_exit_code_and_stderr_are_preserved(self):
        result = self.command("[Console]::Error.WriteLine('test failure'); exit 7")
        self.assertEqual(result['exitCode'], 7)
        self.assertIn('test failure', result['stderr'])
    def test_timeout_terminates_command_tree(self):
        result = self.command('Start-Sleep -Seconds 30', seconds=1)
        self.assertTrue(result['timedOut'])
        self.assertNotEqual(result['exitCode'], 0)
    def test_output_is_bounded(self):
        result = self.command("Write-Output ('x' * 20000)")
        self.assertTrue(result['truncated'])
        self.assertLessEqual(len(result['stdout']), 8192)
    def test_parent_api_secrets_are_not_inherited(self):
        with patch.dict(os.environ, {'TEST_API_KEY': 'do-not-inherit'}):
            result=self.command("Write-Output ([Environment]::GetEnvironmentVariable('TEST_API_KEY'))")
        self.assertNotIn('do-not-inherit', result['stdout'])
    def test_escape_and_missing_workspace_fail_before_spawn(self):
        for req, action in [({'workspace':str(self.root)}, {'command':'Get-Location','cwd':'..'}), ({'workspace':''},{'command':'Get-Location'})]:
            with self.assertRaises((ValueError, FileNotFoundError)), patch('subprocess.Popen') as spawn:
                worker.run_command(req, action)
            spawn.assert_not_called()
    def test_each_command_gets_its_explicit_working_directory(self):
        (self.root/'sub').mkdir()
        one=self.command('(Get-Location).Path',cwd='sub')
        two=self.command('(Get-Location).Path')
        self.assertEqual(Path(one['stdout'].strip()),self.root/'sub')
        self.assertEqual(Path(two['stdout'].strip()),self.root)
    def test_native_extended_paths_are_normalized_for_powershell(self):
        result = worker.run_command({'workspace': '\\\\?\\' + str(self.root)}, {'command': '(Get-Location).Path'})
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(Path(result['stdout'].strip()), self.root)
        self.assertNotIn('FileSystem::', result['stdout'])
    @unittest.skipUnless(shutil.which('node'), 'Node is not installed')
    def test_runtime_arguments_avoid_shell_quoting_and_verify_code(self):
        script = "const fs=require('fs');fs.writeFileSync('counter.cjs', 'exports.createCounter=(n)=>()=>++n;');const c=require('./counter.cjs').createCounter(3);require('assert').deepStrictEqual([c(),c()],[4,5]);console.log('verified');"
        result=worker.run_command({'workspace':str(self.root)},{'executable':'node','args':['-e',script]})
        self.assertEqual(result['exitCode'],0,result['stderr'])
        self.assertIn('verified',result['stdout'])
        self.assertTrue((self.root/'counter.cjs').is_file())
    def test_vscode_discovery_does_not_require_path(self):
        local=self.root/'user apps'
        executable=local/'Programs'/'Microsoft VS Code'/'Code.exe'
        executable.parent.mkdir(parents=True)
        executable.touch()
        with patch.dict(os.environ,{'LOCALAPPDATA':str(local)}),patch.object(worker.shutil,'which',return_value=None):
            tools=worker.tool_environment()
        self.assertEqual(Path(tools['executables']['vscode']),executable)
        self.assertFalse(tools['vscodeOnPath'])
    def test_open_folder_is_not_open_file_and_passes_one_folder_argument(self):
        executable=self.root/'Code.exe'
        with patch.object(worker,'vscode_executable',return_value=executable),patch('subprocess.Popen') as spawn:
            spawn.return_value.pid=123
            result=worker.file_action({'workspace':str(self.root)}, {'kind':'open_folder','path':'.','program':'vscode'})
        self.assertEqual(result['openedFolder'],str(self.root))
        self.assertEqual(spawn.call_args.args[0],[str(executable),'--new-window',str(self.root)])
        with self.assertRaises(ValueError):
            worker.file_action({'workspace':str(self.root)}, {'kind':'open_file','path':'.','program':'notepad'})

if __name__ == '__main__': unittest.main()
