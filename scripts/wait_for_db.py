import os
import socket
import time


host = os.environ["DATABASE_HOST"]
port = int(os.environ.get("DATABASE_PORT", "5432"))
timeout = int(os.environ.get("DATABASE_WAIT_TIMEOUT", "60"))
deadline = time.time() + timeout

print(f"Waiting for database at {host}:{port}...")

while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            print("Database is ready.")
            break
    except OSError:
        if time.time() >= deadline:
            raise TimeoutError(f"Database did not become ready within {timeout} seconds.")
        time.sleep(1)
