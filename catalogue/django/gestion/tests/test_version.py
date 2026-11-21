import json
import tempfile
from pathlib import Path

from django.test import TestCase, override_settings


class VersionTests(TestCase):
    def test_repli_dev_sans_fichier_de_version(self) -> None:
        with override_settings(VERSION_JSON=Path("/chemin/absent/version.json")):
            reponse = self.client.get("/__version__")
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse.json()["version"], "dev")
        self.assertEqual(reponse.json()["changes"], [])
        self.assertEqual(reponse["Cache-Control"], "no-store")

    def test_sert_le_fichier_de_l_image_tel_quel(self) -> None:
        with tempfile.TemporaryDirectory() as dossier:
            fichier = Path(dossier) / "version.json"
            fichier.write_text(json.dumps({"version": "1.2.0", "commit": "abc"}), encoding="utf-8")
            with override_settings(VERSION_JSON=fichier):
                reponse = self.client.get("/__version__")
        self.assertEqual(reponse.json(), {"version": "1.2.0", "commit": "abc"})
