import { useMemo, useState, CSSProperties } from "react";
import { Alert, Button, InputNumber, Space } from "antd";
import { EditableContext } from "../fields/context";
import { useTable } from "../querydb/use-table";
import { client_db } from "@cocalc/util/db-schema";
import { SelectTimeKey } from "./time-keys";
import Gallery from "./gallery";
import Grid from "./grid";
import Calendar from "./calendar";
import type { ViewType } from "../types";
import { Icon } from "@cocalc/frontend/components";
import { getTableDescription } from "../tables";
import ViewMenu from "./view-menu";
import { fieldToLabel } from "../util";
import useFilter from "./filter-input";
import { plural } from "@cocalc/util/misc";
import useHiddenFields from "../syncdb/use-hidden-fields";
import useSortFields from "../syncdb/use-sort-fields";
import useLimit from "../syncdb/use-limit";
import useSearch from "../syncdb/use-search";
import { Loading } from "@cocalc/frontend/components";
import querydbSet from "../querydb/set";

interface Props {
  view: ViewType;
  table: string;
  style?: CSSProperties;
  height?: number | string;
  name: string;
  id: string;
}

export default function View({ table, view, style, height, name, id }: Props) {
  const {
    title,
    query,
    columns: allColumns,
    allowCreate,
    changes,
  } = useMemo(() => getTableDescription(table), [table]);
  const [limit, setLimit] = useLimit({ id });
  const [search, setSearch] = useSearch({ id });
  const [sortFields, setSortField] = useSortFields({ id });
  const [hiddenFields, setHiddenField] = useHiddenFields({ id });
  const columns = useMemo(() => {
    if (hiddenFields.size == 0) {
      return allColumns;
    }
    return allColumns.filter((x) => !hiddenFields.has(x.dataIndex));
  }, [hiddenFields, allColumns]);

  const [timeKey, setTimeKey] = useState<string | undefined>(undefined);
  const [recordHeight, setRecordHeight] = useState<number | undefined>(
    undefined
  );
  const rowKey = useMemo(() => {
    const dbtable = Object.keys(query)[0];
    if (!dbtable) {
      throw Error("invalid query");
    }
    const keys = client_db.primary_keys(dbtable);
    return keys[0];
  }, [table]);

  const {
    data,
    refresh,
    editableContext,
    error: tableError,
    saving,
    loading,
  } = useTable({ query, changes, sortFields, hiddenFields, search, limit });

  const { filteredData, numHidden, Filter } = useFilter({ data, id });

  const [addError, setAddError] = useState<string>("");

  async function addNew() {
    const dbtable = Object.keys(query)[0];

    const x: any = {};

    if (dbtable == "crm_tags") {
      // TODO: need a 'new editor' before it goes into the DB!
      x.name = "New Tag";
    }

    setAddError("");
    try {
      await querydbSet({ [dbtable]: x });
    } catch (err) {
      setAddError(`${err}`);
    }

    refresh();
  }

  const right = (
    <Space wrap style={{ float: "right" }}>
      <b>{title ?? fieldToLabel(table)}</b>
      {allowCreate && (
        <Button onClick={addNew}>
          <Icon name="plus-circle" /> New
        </Button>
      )}
      <Button onClick={refresh}>
        <Icon name="refresh" /> Refresh
      </Button>
    </Space>
  );

  const header = (
    <div>
      {right}{" "}
      <ViewMenu
        query={query}
        name={name}
        view={view}
        columns={allColumns}
        limit={limit}
        setLimit={setLimit}
        sortFields={sortFields}
        setSortField={setSortField}
        hiddenFields={hiddenFields}
        setHiddenField={setHiddenField}
        search={search}
        setSearch={setSearch}
      />
    </div>
  );
  let body;
  switch (view) {
    case "gallery":
      body = (
        <Gallery
          height={height}
          recordHeight={recordHeight}
          rowKey={rowKey}
          data={filteredData}
          columns={columns}
          allColumns={allColumns}
          title={header}
        />
      );
      break;
    case "calendar":
      body = (
        <Calendar
          data={filteredData}
          columns={allColumns}
          allColumns={allColumns}
          title={header}
          timeKey={timeKey}
          rowKey={rowKey}
        />
      );
      break;
    case "grid":
      body = (
        <Grid
          recordHeight={recordHeight}
          data={filteredData}
          columns={columns}
          allColumns={allColumns}
          title={header}
          sortFields={sortFields}
          setSortField={setSortField}
        />
      );
      break;
    default:
      body = <div>Unsupported view type "{view}"</div>;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <div style={style}>
        {loading && (
          <div style={{ float: "right" }}>
            <Loading delay={200} text="Loading from database..." />
          </div>
        )}
        {saving && (
          <div style={{ float: "right" }}>
            <Loading delay={200} text="Saving to database..." />
          </div>
        )}
        {tableError && (
          <Alert
            type="error"
            message="Database Query Error"
            description={tableError}
          />
        )}
        {addError && (
          <Alert
            type="error"
            message="Error Creating New Record"
            description={addError}
          />
        )}
        <Space>
          {Filter}
          {view == "calendar" && (
            <SelectTimeKey
              onChange={setTimeKey}
              query={query}
              style={{ marginBottom: "5px" }}
            />
          )}
          {(view == "grid" || view == "gallery") && (
            <InputNumber
              placeholder="Height..."
              onChange={(value) => setRecordHeight(value ?? undefined)}
              value={recordHeight}
              min={40}
              step={5}
              style={{ width: "100px", marginLeft: "5px", marginBottom: "5px" }}
            />
          )}
        </Space>
        {numHidden > 0 ? (
          <div style={{ marginTop: "-10px", float: "right" }}>
            <Alert
              showIcon
              type="warning"
              message={`Filtered: only showing ${filteredData.length} of ${
                data.length
              } ${plural(data.length, "result")}`}
            />
          </div>
        ) : undefined}
        {body}
      </div>
    </EditableContext.Provider>
  );
}
