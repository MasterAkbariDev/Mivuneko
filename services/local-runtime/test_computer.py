"""Filesystem containment and lossless-edit checks; no app interaction."""
import tempfile
import unittest
from pathlib import Path
import computer

class WorkspaceTests(unittest.TestCase):
    def test_escape_and_secret_paths_are_rejected(self):
        with self.assertRaises(ValueError):computer.file_action({"workspace":""},{"kind":"list_files"})
        with tempfile.TemporaryDirectory() as root:
            for name in ["../outside.txt", ".env", ".env.local", ".git/config", ".ssh/id_rsa", "private.key"]:
                with self.assertRaises(ValueError,msg=name): computer.file_path(root,name)

    def test_edits_keep_backups_and_moves_never_overwrite(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as backups:
            request={"workspace":root,"backupDir":backups}
            original="def greeting():\n    return 'hello'\n"
            edited="def greeting():\n    return 'hello world'\n"
            computer.file_action(request,{"kind":"write_file","path":"example.py","text":original})
            computer.file_action(request,{"kind":"write_file","path":"example.py","text":edited})
            self.assertEqual(computer.file_action(request,{"kind":"read_file","path":"example.py"})["text"],edited)
            self.assertEqual(next(Path(backups).iterdir()).read_text(),original)
            computer.file_action(request,{"kind":"write_file","path":"other.py","text":"keep"})
            with self.assertRaises(ValueError):computer.file_action(request,{"kind":"move_file","path":"example.py","destination":"other.py"})
            self.assertEqual((Path(root)/"other.py").read_text(),"keep")
if __name__ == '__main__':unittest.main()
