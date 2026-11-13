import os

os.environ.setdefault("CONDUIT_DB_URL", "sqlite:///:memory:")
os.environ.setdefault("CONDUIT_SETTINGS", "/tmp/conduit_test_settings.json")
