import os
import pymysql
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def export_mysql_database():
    conn = pymysql.connect(
        host=os.getenv('DATABASE_HOST', 'localhost'),
        port=int(os.getenv('DATABASE_PORT', 3306)),
        user=os.getenv('DATABASE_USER', 'transconnect'),
        password=os.getenv('DATABASE_PASSWORD', 'Yash@0024'),
        database=os.getenv('DATABASE_NAME', 'transconnectlinkx'),
        charset='utf8mb4'
    )
    cur = conn.cursor()

    tables = [
        'users', 'password_resets', 'vehicles', 'drivers',
        'shipments', 'documents', 'messages', 'notifications', 'tracking_records'
    ]

    dump_lines = [
        "-- ===============================================================",
        "-- TRANCECONNECT-PRIME: COMPLETE DATABASE PROJECT DUMP",
        "-- Target Database: transconnectlinkx",
        "-- Relational MySQL 8.0 Data & Schema",
        "-- ===============================================================",
        "",
        "SET FOREIGN_KEY_CHECKS=0;",
        "CREATE DATABASE IF NOT EXISTS `transconnectlinkx`;",
        "USE `transconnectlinkx`;",
        ""
    ]

    for tbl in tables:
        dump_lines.append(f"-- -------------------------------------------------------------")
        dump_lines.append(f"-- Structure for table `{tbl}`")
        dump_lines.append(f"-- -------------------------------------------------------------")
        dump_lines.append(f"DROP TABLE IF EXISTS `{tbl}`;")
        cur.execute(f"SHOW CREATE TABLE `{tbl}`;")
        create_sql = cur.fetchone()[1]
        dump_lines.append(create_sql + ";")
        dump_lines.append("")

        cur.execute(f"SELECT * FROM `{tbl}`;")
        rows = cur.fetchall()
        if rows:
            dump_lines.append(f"-- Data records for `{tbl}` ({len(rows)} rows)")
            col_names = [f"`{desc[0]}`" for desc in cur.description]
            cols_str = ", ".join(col_names)
            for r in rows:
                vals = []
                for v in r:
                    if v is None:
                        vals.append("NULL")
                    elif isinstance(v, (int, float)):
                        vals.append(str(v))
                    else:
                        escaped = str(v).replace("\\", "\\\\").replace("'", "''")
                        vals.append(f"'{escaped}'")
                dump_lines.append(f"INSERT INTO `{tbl}` ({cols_str}) VALUES ({', '.join(vals)});")
            dump_lines.append("")

    dump_lines.append("SET FOREIGN_KEY_CHECKS=1;")
    dump_lines.append("-- Dump completed successfully.")

    out_file = os.path.join(os.path.dirname(__file__), 'transconnectlinkx_dump.sql')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(dump_lines))

    print(f"Database exported successfully to: {out_file} (Size: {os.path.getsize(out_file)} bytes)")
    conn.close()

if __name__ == '__main__':
    export_mysql_database()
