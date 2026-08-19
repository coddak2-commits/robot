"""admin 계정 생성 스크립트. 한 번만 실행."""
import getpass
import hashlib
import pymysql

username = input("admin username [admin]: ").strip() or "admin"
password = getpass.getpass("password: ")
full_name = input("full name [관리자]: ").strip() or "관리자"

db_pw = getpass.getpass("MariaDB root password: ")

conn = pymysql.connect(host="localhost", user="root", password=db_pw, database="robot_welding", charset="utf8mb4")
try:
    with conn.cursor() as cur:
        hashed = hashlib.sha256(password.encode("utf-8")).hexdigest()
        cur.execute(
            "INSERT INTO users (username, password_hash, name, role, active) VALUES (%s, %s, %s, 'admin', TRUE)",
            (username, hashed, full_name),
        )
        conn.commit()
        print(f"OK. user id={cur.lastrowid}, hash_len={len(hashed)}")
finally:
    conn.close()
