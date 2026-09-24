import zipfile

from scripts import sync_skills


def make_skill(root, name, body="# skill\n", extra=None):
    skill = root / name
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(f"---\nname: {name}\n---\n{body}", encoding="utf-8")
    for rel, text in (extra or {}).items():
        path = skill / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return skill


def test_copies_new_skill_and_skips_junk(tmp_path):
    src, dest = tmp_path / "src", tmp_path / "dest"
    make_skill(src, "alpha", extra={"scripts/run.py": "print(1)\n", ".env": "X=1\n",
                                    "__pycache__/x.pyc": "junk"})
    (src / "not-a-skill").mkdir()

    report = sync_skills.sync(src, dest)

    assert report["added"] == ["alpha"]
    assert (dest / "alpha" / "SKILL.md").is_file()
    assert (dest / "alpha" / "scripts" / "run.py").is_file()
    assert not (dest / "alpha" / ".env").exists()
    assert not (dest / "alpha" / "__pycache__").exists()
    assert not (dest / "not-a-skill").exists()


def test_blocks_skill_with_secret(tmp_path):
    src, dest = tmp_path / "src", tmp_path / "dest"
    make_skill(src, "leaky", body="key: sk-ant-api03-abcdefghijkl\n")

    report = sync_skills.sync(src, dest)

    assert report["blocked"] and report["blocked"][0].startswith("leaky")
    assert not (dest / "leaky").exists()


def test_existing_skill_kept_unless_update(tmp_path):
    src, dest = tmp_path / "src", tmp_path / "dest"
    make_skill(src, "alpha", body="new\n")
    make_skill(dest, "alpha", body="old\n", extra={"stale.txt": "x"})

    assert sync_skills.sync(src, dest)["kept"] == ["alpha"]
    assert "old" in (dest / "alpha" / "SKILL.md").read_text(encoding="utf-8")

    assert sync_skills.sync(src, dest, update=True)["updated"] == ["alpha"]
    assert "new" in (dest / "alpha" / "SKILL.md").read_text(encoding="utf-8")
    assert not (dest / "alpha" / "stale.txt").exists()

    assert sync_skills.sync(src, dest, update=True)["unchanged"] == ["alpha"]


def test_dry_run_writes_nothing(tmp_path):
    src, dest, zips = tmp_path / "src", tmp_path / "dest", tmp_path / "zips"
    make_skill(src, "alpha")

    report = sync_skills.sync(src, dest, dry_run=True, zip_dir=zips)

    assert report["added"] == ["alpha"]
    assert not dest.exists() and not zips.exists()


def test_exclude_and_local_path_warning(tmp_path):
    src, dest = tmp_path / "src", tmp_path / "dest"
    make_skill(src, "alpha", body="run C:\\Users\\me\\tool.exe\n")
    make_skill(src, "beta")

    report = sync_skills.sync(src, dest, exclude=frozenset({"beta"}))

    assert report["added"] == ["alpha"]
    assert any("alpha" in w and "로컬 절대경로" in w for w in report["warnings"])


def test_zip_has_skill_folder_at_top(tmp_path):
    src, dest, zips = tmp_path / "src", tmp_path / "dest", tmp_path / "zips"
    make_skill(src, "alpha", extra={"refs/a.md": "a"})

    sync_skills.sync(src, dest, zip_dir=zips)

    names = zipfile.ZipFile(zips / "alpha.zip").namelist()
    assert sorted(names) == ["alpha/SKILL.md", "alpha/refs/a.md"]


def test_commands_copied_once(tmp_path):
    src, dest = tmp_path / "commands", tmp_path / "dest"
    src.mkdir()
    (src / "foo.md").write_text("run foo", encoding="utf-8")

    assert sync_skills.sync_commands(src, dest, update=False, dry_run=False) == ["foo.md"]
    assert sync_skills.sync_commands(src, dest, update=False, dry_run=False) == []
