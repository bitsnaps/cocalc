/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Input, InputRef, Radio, Space, Tooltip } from "antd";
import { delay } from "awaiting";
import { List } from "immutable";
import { debounce, fromPairs } from "lodash";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import {
  ProjectActions,
  React,
  TypedMap,
  redux,
  useActions,
  useEffect,
  useIsMountedRef,
  useLayoutEffect,
  useMemo,
  usePrevious,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Icon, Loading, Text } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import {
  DirectoryListing,
  DirectoryListingEntry,
  FileMap,
} from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/project/websocket/listings";
import { mutate_data_to_compute_public_files } from "@cocalc/frontend/project_store";
import track from "@cocalc/frontend/user-tracking";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import {
  copy_without,
  path_to_file,
  search_match,
  search_split,
  separate_file_extension,
  should_open_in_foreground,
  strictMod,
  tab_to_path,
  unreachable,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { useProjectState } from "../project-state-hook";
import { FileListItem, fileItemStyle } from "./components";
import { DEFAULT_EXT, FLYOUT_PADDING } from "./consts";
import { FilesBottom } from "./files-bottom";

type ActiveFileSort = TypedMap<{
  column_name: string;
  is_descending: boolean;
}>;

// modeled after ProjectStore::stripped_public_paths
function useStrippedPublicPaths(project_id: string) {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  return useMemo(() => {
    if (public_paths == null) return List();
    return public_paths
      .valueSeq()
      .map((public_path: any) =>
        copy_without(public_path.toJS(), ["id", "project_id"])
      );
  }, [public_paths]);
}

function searchToFilename(search: string): string {
  search = search.trim();
  if (search === "") return "";
  // if last character is "/" return the search string
  if (search.endsWith("/")) return search;
  const { ext } = separate_file_extension(search);
  if (ext.length > 0) return search;
  if (ext === "") return `${search}.${DEFAULT_EXT}`;
  return `${search}.${DEFAULT_EXT}`;
}

export function FilesFlyout({ project_id }): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootHeightPx, setRootHeightPx] = useState<number>(0);
  const refInput = useRef<InputRef>(null);
  const actions: ProjectActions | undefined = useActions({ project_id });
  const project_state = useProjectState(project_id);
  const projectIsRunning = project_state?.get("state") === "running";
  const current_path = useTypedRedux({ project_id }, "current_path");
  const strippedPublicPaths = useStrippedPublicPaths(project_id);
  const directoryListings = useTypedRedux({ project_id }, "directory_listings");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error"
  );
  const activeFileSort: ActiveFileSort = useTypedRedux(
    { project_id },
    "active_file_sort"
  );
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const kucalc = useTypedRedux("customize", "kucalc");
  const show_masked = useTypedRedux({ project_id }, "show_masked");
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const [search, setSearch] = useState<string>("");
  // mainly controls what a single click does, plus additional UI elements
  const [mode, setMode] = useState<"open" | "select">("open");
  const [prevSelected, setPrevSelected] = useState<number | null>(null);
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scollIdxHide, setScrollIdxHide] = useState<boolean>(false);
  const [selectionOnMouseDown, setSelectionOnMouseDown] = useState<string>("");
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const disableUploads = student_project_functionality.disableUploads ?? false;
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::files::${current_path}`,
  });
  const uploadClassName = `upload-button-flyout-${project_id}`;

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  // copied roughly from directoy-selector.tsx
  useEffect(() => {
    // Run the loop below every 30s until project_id or current_path changes (or unmount)
    // in which case loop stops.  If not unmount, then get new loops for new values.
    if (!project_id) return;
    const state = { loop: true };
    (async () => {
      while (state.loop && isMountedRef.current) {
        // Component is mounted, so call watch on all expanded paths.
        const listings = redux.getProjectStore(project_id).get_listings();
        listings.watch(current_path);
        await delay(WATCH_THROTTLE_MS);
      }
    })();
    return () => {
      state.loop = false;
    };
  }, [project_id, current_path]);

  // selecting files switches over to "select" mode
  useEffect(() => {
    if (mode === "open" && checked_files.size > 0) {
      setMode("select");
    }
    // this doesn't switch back to open mode, if no files are selected,
    // because it's nicer to keep the checkboxes if everything is deselected
  }, [checked_files]);

  const [directoryFiles, fileMap, activeFile] = useMemo((): [
    DirectoryListing,
    FileMap,
    DirectoryListingEntry | null
  ] => {
    const empty: [DirectoryListing, FileMap, null] = [[], {}, null];
    if (directoryListings == null) return empty;
    const filesStore = directoryListings.get(current_path);
    if (filesStore == null) return empty;

    // TODO this is an error, process it
    if (typeof filesStore === "string") return empty;

    const files: DirectoryListing = filesStore.toJS();
    let activeFile: DirectoryListingEntry | null = null;
    compute_file_masks(files);
    const searchWords = search_split(search.trim().toLowerCase());

    const procFiles = files
      .filter((file: DirectoryListingEntry) => {
        file.name ??= ""; // sanitization

        if (search === "") return true;
        const fName = file.name.toLowerCase();
        return (
          search_match(fName, searchWords) ||
          ((file.isdir ?? false) && search_match(`${fName}/`, searchWords))
        );
      })
      .filter(
        (file: DirectoryListingEntry) => show_masked || !(file.mask === true)
      )
      .filter(
        (file: DirectoryListingEntry) => hidden || !file.name.startsWith(".")
      );

    // this shares the logic with what's in project_store.js
    mutate_data_to_compute_public_files(
      {
        listing: procFiles,
        public: {},
      },
      strippedPublicPaths,
      current_path
    );

    procFiles.sort((a, b) => {
      // This replicated what project_store is doing
      const col = activeFileSort.get("column_name");
      switch (col) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return (a.size ?? 0) - (b.size ?? 0);
        case "time":
          return (b.mtime ?? 0) - (a.mtime ?? 0);
        case "type":
          const aDir = a.isdir ?? false;
          const bDir = b.isdir ?? false;
          if (aDir && !bDir) return -1;
          if (!aDir && bDir) return 1;
          const aExt = a.name.split(".").pop() ?? "";
          const bExt = b.name.split(".").pop() ?? "";
          return aExt.localeCompare(bExt);
        default:
          console.warn(`flyout/files: unknown sort column ${col}`);
          return 0;
      }
    });

    for (const file of procFiles) {
      const fullPath = path_to_file(current_path, file.name);
      if (openFiles.some((path) => path == fullPath)) {
        file.isopen = true;
      }
      if (activePath === fullPath) {
        file.isactive = true;
        activeFile = file;
      }
    }

    if (activeFileSort.get("is_descending")) {
      procFiles.reverse(); // inplace op
    }

    if (current_path != "") {
      procFiles.unshift({
        name: "..",
        isdir: true,
      });
    }

    // map each filename to it's entry in the directory listing
    const fileMap = fromPairs(procFiles.map((file) => [file.name, file]));

    return [procFiles, fileMap, activeFile];
  }, [
    directoryListings,
    activeFileSort,
    hidden,
    search,
    openFiles,
    show_masked,
    current_path,
    strippedPublicPaths,
  ]);

  const prev_current_path = usePrevious(current_path);

  useEffect(() => {
    // reset prev selection if path changes
    setPrevSelected(null);

    // if the current_path changes and there was a previous one,
    // we reset the checked files as well. This should probably be somewhere in the actions, though.
    // The edge case is when more than one editor in different directories is open,
    // and you switch between the two. Checked files are not reset in that case.
    if (prev_current_path != null && prev_current_path !== current_path) {
      actions?.set_all_files_unchecked();
    }

    // if we change directory *and* use the keyboard, we re-focus the input
    if (scrollIdx != null) {
      refInput.current?.focus();
    }
    setScrollIdx(null);
  }, [current_path]);

  const triggerRootResize = debounce(
    () => setRootHeightPx(rootRef.current?.clientHeight ?? 0),
    50,
    { leading: false, trailing: true }
  );

  // observe the root element's height
  useLayoutEffect(() => {
    if (rootRef.current == null) return;
    const observer = new ResizeObserver(triggerRootResize);
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  // *** END HOOKS ***

  if (directoryListings == null) {
    (async () => {
      await delay(0);
      // Ensure store gets initialized before redux
      // E.g., for copy between projects you make this
      // directory selector before even opening the project.
      redux.getProjectStore(project_id);
    })();
  }

  if (directoryListings.get(current_path) == null) {
    (async () => {
      // Must happen in a different render loop, hence the delay, because
      // fetch can actually update the store in the same render loop.
      await delay(0);
      redux
        .getProjectActions(project_id)
        ?.fetch_directory_listing({ path: current_path });
    })();
  }

  function open(
    e: React.MouseEvent | React.KeyboardEvent,
    index: number,
    skip = false // to exclude directories
  ) {
    e.stopPropagation();
    const file = directoryFiles[index];
    if (file == null) return;

    if (!skip) {
      const fullPath = path_to_file(current_path, file.name);

      if (file.isdir) {
        // true: change history, false: do not show "files" page
        actions?.open_directory(fullPath, true, false);
        setSearch("");
      } else {
        const foreground = should_open_in_foreground(e);
        track("open-file", {
          project_id,
          path: fullPath,
          how: "click-on-listing-flyout",
        });
        actions?.open_file({
          path: fullPath,
          foreground,
        });
      }
    }

    const fn = file.name;
    if (checked_files.includes(fn)) {
      actions?.set_file_list_unchecked(List([fn]));
    }
  }

  function toggleSelected(index: number, fn: string, nextState?: boolean) {
    // never select "..", only calls for trouble
    if (fn === "..") return;
    fn = path_to_file(current_path, fn);
    window.getSelection()?.removeAllRanges();
    if (nextState != null ? !nextState : checked_files.includes(fn)) {
      // deselects the file
      actions?.set_file_list_unchecked(List([fn]));
      if (checked_files.size <= 1) {
        // because the above will remove the last checked item, we revert back to "open" mode
        setMode("open");
        setPrevSelected(null);
      } else {
        setPrevSelected(index);
      }
    } else {
      // selects the file
      actions?.set_file_list_checked([fn]);
      setPrevSelected(index);
      setMode("select");
    }
  }

  function handleFileClick(e: React.MouseEvent, index: number) {
    // "hack" from explorer/file-listing/file-row.tsx to avoid a click,
    // if the user selects the filename -- ignore double clicks, though.
    if (
      e.detail !== 2 &&
      (window.getSelection()?.toString() ?? "") !== selectionOnMouseDown
    ) {
      return;
    }

    // deselect text if any
    window.getSelection()?.removeAllRanges();
    const file = directoryFiles[index];

    // doubleclick straight to open file
    if (e.detail === 2) {
      setPrevSelected(index);
      open(e, index);
      return;
    }

    // similar, if in open mode and already opened, just switch to it as well
    if (mode === "open" && file.isopen && !e.shiftKey && !e.ctrlKey) {
      setPrevSelected(index);
      open(e, index);
      return;
    }

    // shift-click selects whole range from last selected (if not null) to current index
    if (e.shiftKey && prevSelected != null) {
      const start = Math.min(prevSelected, index);
      const end = Math.max(prevSelected, index);
      const add = !checked_files.includes(
        path_to_file(current_path, directoryFiles[index].name)
      );
      let fileNames: string[] = [];
      for (let i = start; i <= end; i++) {
        const fn = directoryFiles[i].name;
        if (fn === "..") continue; // don't select parent dir, just calls for trouble
        fileNames.push(path_to_file(current_path, fn));
      }
      if (add) {
        actions?.set_file_list_checked(fileNames);
      } else {
        actions?.set_file_list_unchecked(List(fileNames));
      }
      return;
    }

    switch (mode) {
      case "select":
        toggleSelected(index, file.name);
        break;

      case "open":
        if (e.shiftKey || e.ctrlKey) {
          // Shift case: no prevSelected, otherwise see above
          toggleSelected(index, file.name);
        } else {
          setPrevSelected(index);
          open(e, index);
        }
        break;

      default:
        unreachable(mode);
    }
  }

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      directoryFiles.length
    );
    setScrollIdx(nextIdx);
    virtuosoRef.current?.scrollToIndex({
      index: nextIdx,
      align: "center",
    });
  }

  async function createFileOrFolder() {
    const fn = searchToFilename(search);
    await actions?.create_file({
      name: fn,
      current_path,
    });
  }

  function filterKeyHandler(e: React.KeyboardEvent) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // left arrow key: go up a directory
    else if (e.code === "ArrowLeft") {
      if (current_path != "") {
        actions?.set_current_path(
          current_path.split("/").slice(0, -1).join("/")
        );
      }
    }

    // return key pressed
    else if (e.code === "Enter") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (search != "") {
        setSearch("");
        if (directoryFiles.length > 0) {
          open(e, 0);
        } else {
          createFileOrFolder();
        }
      }
    }

    // if esc key is pressed, clear search and reset scroll index
    else if (e.key === "Escape") {
      setSearch("");
      setScrollIdx(null);
    }
  }

  function showFileSharingDialog(file?: { name: string }) {
    if (!file) return;
    actions?.set_active_tab("files");
    const fullPath = path_to_file(current_path, file.name);
    // only select the published file, same logic as in file-row.tsx
    actions?.set_all_files_unchecked();
    actions?.set_file_list_checked([fullPath]);
    actions?.set_file_action("share");
  }

  function renderListItem(index: number, item: DirectoryListingEntry) {
    const { mtime, mask = false } = item;
    const age = typeof mtime === "number" ? 1000 * mtime : null;
    // either select by scrolling (and only scrolling!) or by clicks
    const isSelected =
      scrollIdx != null
        ? !scollIdxHide && index === scrollIdx
        : checked_files.includes(
            path_to_file(current_path, directoryFiles[index].name)
          );
    return (
      <FileListItem
        item={item}
        onClick={(e) => handleFileClick(e, index)}
        onMouseDown={(e: React.MouseEvent, name: string) => {
          setSelectionOnMouseDown(window.getSelection()?.toString() ?? "");
          if (e.button === 1) {
            actions?.close_tab(path_to_file(current_path, name));
          }
        }}
        itemStyle={fileItemStyle(age ?? 0, mask)}
        onClose={(e: React.MouseEvent, name: string) => {
          e.stopPropagation();
          actions?.close_tab(path_to_file(current_path, name));
        }}
        onPublic={() => showFileSharingDialog(directoryFiles[index])}
        selected={isSelected}
        showCheckbox={mode === "select" || checked_files?.size > 0}
        onChecked={(nextState: boolean) => {
          toggleSelected(index, item.name, nextState);
        }}
      />
    );
  }

  function renderListing(): JSX.Element {
    const files = directoryListings.get(current_path);
    if (files == null) return <Loading theme="medium" transparent />;

    return (
      <Virtuoso
        ref={virtuosoRef}
        style={{}}
        increaseViewportBy={10}
        totalCount={directoryFiles.length}
        itemContent={(index) => {
          const file = directoryFiles[index];
          if (file == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return renderListItem(index, file);
        }}
        {...virtuosoScroll}
      />
    );
  }

  function wrapDropzone(children: JSX.Element): JSX.Element {
    if (disableUploads) return children;
    return (
      <FileUploadWrapper
        project_id={project_id}
        dest_path={current_path}
        event_handlers={{
          complete: () => actions?.fetch_directory_listing(),
        }}
        config={{ clickable: `.${uploadClassName}` }}
        className="smc-vfill"
      >
        {children}
      </FileUploadWrapper>
    );
  }

  function renderSortButton(name: string, display: string): JSX.Element {
    const isActive = activeFileSort.get("column_name") === name;
    const direction = isActive ? (
      <Icon
        style={{ marginLeft: FLYOUT_PADDING }}
        name={activeFileSort.get("is_descending") ? "caret-up" : "caret-down"}
      />
    ) : undefined;

    return (
      <Radio.Button
        value={name}
        style={{ background: isActive ? COLORS.ANTD_BG_BLUE_L : undefined }}
        onClick={() => actions?.set_sorted_file_column(name)}
      >
        {display}
        {direction}
      </Radio.Button>
    );
  }

  function renderHeader() {
    return (
      <Space
        direction="vertical"
        style={{
          flex: "0 0 auto",
          paddingBottom: FLYOUT_PADDING,
          paddingRight: FLYOUT_PADDING,
          borderBottom: FIX_BORDER,
        }}
      >
        {wrapDropzone(
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Radio.Group size="small">
              {renderSortButton("name", "Name")}
              {renderSortButton("size", "Size")}
              {renderSortButton("time", "Time")}
              {renderSortButton("type", "Type")}
            </Radio.Group>
            <Space.Compact direction="horizontal" size={"small"}>
              <Button
                className={uploadClassName}
                size="small"
                disabled={!projectIsRunning || disableUploads}
              >
                <Icon name={"upload"} />
              </Button>
              <Tooltip title="Create a new file" placement="bottom">
                <Button
                  size="small"
                  type="primary"
                  onClick={() => actions?.toggleFlyout("new")}
                >
                  <Icon name={"plus-circle"} />
                </Button>
              </Tooltip>
            </Space.Compact>
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
            gap: FLYOUT_PADDING,
          }}
        >
          <Input
            ref={refInput}
            placeholder="Filter..."
            size="small"
            value={search}
            onKeyDown={filterKeyHandler}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setScrollIdxHide(false)}
            onBlur={() => setScrollIdxHide(true)}
            style={{ flex: "1" }}
            allowClear
            prefix={<Icon name="search" />}
          />
          <Space.Compact direction="horizontal" size="small">
            <BootstrapButton
              title={hidden ? "Hide hidden files" : "Show hidden files"}
              bsSize="xsmall"
              style={{ flex: "0" }}
              onClick={() => actions?.setState({ show_hidden: !hidden })}
            >
              <Icon name={hidden ? "eye" : "eye-slash"} />
            </BootstrapButton>
            <BootstrapButton
              title={show_masked ? "Hide masked files" : "Show masked files"}
              bsSize="xsmall"
              style={{ flex: "0" }}
              active={!show_masked}
              onClick={() => actions?.setState({ show_masked: !show_masked })}
            >
              <Icon name={"mask"} />
            </BootstrapButton>
          </Space.Compact>
          {kucalc === KUCALC_COCALC_COM ? (
            <Space.Compact direction="horizontal" size="small">
              <Button
                onClick={() => {
                  actions?.open_directory(".snapshots");
                  track("snapshots", { action: "open", where: "flyout-files" });
                }}
                title={
                  "Open the filesystem snapshots of this project, which may also be helpful in recovering past versions."
                }
                icon={<Icon name={"life-ring"} />}
              />
            </Space.Compact>
          ) : undefined}
        </div>
        {staleListingWarning()}
        {createFileIfNotExists()}
        {renderFileCreationError()}
      </Space>
    );
  }

  function renderFileCreationError() {
    if (!file_creation_error) return;
    return (
      <ErrorDisplay
        banner
        error={file_creation_error}
        componentStyle={{
          margin: 0,
          maxHeight: "200px",
        }}
        onClose={(): void => {
          actions?.setState({ file_creation_error: "" });
        }}
      />
    );
  }

  function createFileIfNotExists() {
    if (search === "" || directoryFiles.length > 0) return;

    const what = search.trim().endsWith("/") ? "directory" : "file";
    return (
      <Alert
        type="info"
        banner
        showIcon={false}
        style={{ padding: FLYOUT_PADDING, margin: 0 }}
        description={
          <>
            Hit <Text code>Return</Text> to create the {what}{" "}
            <Text code>{searchToFilename(search)}</Text>
          </>
        }
      />
    );
  }

  function staleListingWarning() {
    if (projectIsRunning || (directoryFiles?.length ?? 0) === 0) return;

    return (
      <Alert
        type="warning"
        banner
        showIcon={false}
        style={{ padding: FLYOUT_PADDING, margin: 0 }}
        message={
          <>
            <Icon name="warning" /> Stale directory listing
          </>
        }
        description={
          <>
            To update,{" "}
            <a
              onClick={() => {
                redux.getActions("projects").start_project(project_id);
              }}
            >
              start this project
            </a>
            .
          </>
        }
      />
    );
  }

  return (
    <div
      ref={rootRef}
      style={{ flex: "1 0 auto", flexDirection: "column", display: "flex" }}
    >
      {renderHeader()}
      {disableUploads ? (
        renderListing()
      ) : (
        <FileUploadWrapper
          project_id={project_id}
          dest_path={current_path}
          event_handlers={{
            complete: () => actions?.fetch_directory_listing(),
          }}
          style={{
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
          }}
          className="smc-vfill"
        >
          {renderListing()}
        </FileUploadWrapper>
      )}
      <FilesBottom
        project_id={project_id}
        checked_files={checked_files}
        activeFile={activeFile}
        directoryData={[directoryFiles, fileMap]}
        modeState={[mode, setMode]}
        projectIsRunning={projectIsRunning}
        rootHeightPx={rootHeightPx}
        clearAllSelections={(switchMode) => {
          if (switchMode) setMode("open");
          setPrevSelected(null);
          actions?.set_all_files_unchecked();
        }}
        selectAllFiles={() => {
          setMode("select");
          actions?.set_file_list_checked(
            directoryFiles
              .filter((f) => f.name !== "..")
              .map((f) => path_to_file(current_path, f.name))
          );
        }}
        open={open}
        showFileSharingDialog={showFileSharingDialog}
      />
    </div>
  );
}
