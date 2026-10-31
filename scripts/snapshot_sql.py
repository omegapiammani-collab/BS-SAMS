"""Render SQL snapshots with bounded statements for large D1 text values."""

def literal(value):
    return "'" + value.replace("'", "''") + "'"

def identifier(value):
    return '"' + value.replace('"', '""') + '"'

def render_snapshot(schema, tables, columns_by_table, groups, sequence):
    statements = ["PRAGMA defer_foreign_keys=TRUE;"]
    statements += [row["sql"] + ";" for row in schema if row["type"] == "table"]
    def value_sql(value):
        if value is None:
            return "NULL"
        if isinstance(value, str):
            return literal(value)
        if isinstance(value, (int, float)):
            return str(value)
        raise ValueError("Unsupported value type in API snapshot")

    for name, group in zip(tables, groups):
        columns = columns_by_table[name]
        for row in group:
            statement = "INSERT INTO " + identifier(name) + " VALUES(" + ",".join(value_sql(value) for value in row) + ");"
            if len(statement.encode()) <= 90000:
                statements.append(statement)
                continue
            # D1 limits individual SQL statements to 100 KB. Large logo JSON must be
            # restored in bounded updates, preserving every byte and quote.
            large = [i for i, value in enumerate(row) if isinstance(value, str) and len(value) > 1000]
            primary = [i for i, column in enumerate(columns) if column["pk"]]
            if not primary or any(index in large for index in primary):
                raise ValueError("Large primary key; use native D1 export")
            where = " AND ".join(identifier(columns[index]["name"]) + "=" + value_sql(row[index]) for index in primary)
            initial = ["''" if index in large else value_sql(value) for index, value in enumerate(row)]
            statements.append("INSERT INTO " + identifier(name) + " VALUES(" + ",".join(initial) + ");")
            for index in large:
                column = identifier(columns[index]["name"])
                for offset in range(0, len(row[index]), 8000):
                    statements.append("UPDATE " + identifier(name) + " SET " + column + "=" + column + "||" + literal(row[index][offset:offset + 8000]) + " WHERE " + where + ";")

    statements += [row["sql"] + ";" for row in schema if row["type"] != "table"]
    for sequence in sequence:
        statements.append("UPDATE sqlite_sequence SET seq=" + str(int(sequence["seq"])) + " WHERE name=" + literal(sequence["name"]) + ";")
    if any(len(statement.encode()) > 90000 for statement in statements):
        raise ValueError("A snapshot statement exceeds the safe D1 statement size")
    return "\n".join(statements) + "\n"
