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


class BackgroundTests(unittest.TestCase):
    def test_background_controls_do_not_focus_or_use_global_keys(self):
        from types import SimpleNamespace as NS
        from unittest.mock import MagicMock,patch
        rectangle=NS(left=0,top=0,width=lambda:200,height=lambda:100,mid_point=lambda:NS(x=50,y=50))
        info=NS(runtime_id=[1,2],is_password=False,control_type="Edit")
        element=NS(handle=0,element_info=info,rectangle=lambda:rectangle,is_visible=lambda:True,is_enabled=lambda:True,iface_value=MagicMock(),iface_invoke=MagicMock())
        window=NS(rectangle=lambda:rectangle,descendants=lambda:[element],process_id=lambda:42)
        request={"window":"1","background":True,"expected":{"width":100,"height":50,"title":"Old title","processId":42}}
        with patch.object(computer,"target",return_value=window) as target:
            computer.act({**request,"action":{"kind":"type","element":"1.2","text":"hello"}})
            target.assert_called_with("1",focus=False)
            element.iface_value.SetValue.assert_called_once_with("hello")
            info.control_type="Button"
            computer.act({**request,"action":{"kind":"click","element":"1.2"}})
            element.iface_invoke.Invoke.assert_called_once()
            with self.assertRaisesRegex(ValueError,"window changed"):
                computer.act({**request,"action":{"kind":"click","x":50,"y":50}})
            with self.assertRaisesRegex(ValueError,"FOREGROUND_REQUIRED"):
                computer.act({**request,"expected":None,"action":{"kind":"key","key":"ENTER"}})
            info.is_password=True
            with self.assertRaisesRegex(ValueError,"Protected input"):
                computer.act({**request,"action":{"kind":"type","element":"1.2","text":"secret"}})

if __name__ == '__main__':unittest.main()
