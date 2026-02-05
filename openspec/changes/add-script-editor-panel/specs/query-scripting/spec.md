## ADDED Requirements

### Requirement: Script Editor Panel
The system SHALL provide a webview-based script editor panel for writing and executing SQL queries against database connections.

#### Scenario: Open new script editor
- **WHEN** user invokes the "Open Script Editor" command
- **THEN** a new webview panel opens with SQL textarea and toolbar
- **AND** the panel title is "New Query"
- **AND** focus is set to the SQL textarea

#### Scenario: Multiple script panels
- **WHEN** user opens multiple script editors
- **THEN** each panel is independent with its own SQL content
- **AND** each panel maintains its own connection selection
- **AND** each panel has its own results display

#### Scenario: Panel disposal
- **WHEN** user closes a script editor panel
- **THEN** all resources are cleaned up
- **AND** any pending queries are cancelled
- **AND** the panel is removed from the active panels set

#### Scenario: Close with uncommitted changes
- **WHEN** user attempts to close panel with uncommitted changes
- **THEN** confirmation dialog appears warning about pending changes
- **AND** user can choose to commit, rollback, or cancel close
- **AND** dismissing dialog cancels the close operation

### Requirement: Split Pane Layout
The system SHALL provide a split pane layout with SQL editor on top and results on bottom.

#### Scenario: Initial layout
- **WHEN** script editor opens
- **THEN** SQL textarea fills the entire panel
- **AND** results pane is hidden

#### Scenario: Show results after execution
- **WHEN** a query is executed successfully
- **THEN** the panel splits vertically
- **AND** SQL editor appears in top half
- **AND** results table appears in bottom half
- **AND** a draggable divider separates the panes

#### Scenario: Resize panes
- **WHEN** user drags the divider
- **THEN** pane sizes adjust proportionally
- **AND** minimum height of 100px is enforced for each pane
- **AND** the ratio persists during the panel session

### Requirement: Connection Dropdown
The system SHALL provide a connection dropdown to select the target database for query execution.

#### Scenario: Dropdown initialization
- **WHEN** script editor opens
- **THEN** dropdown is populated with all configured connections
- **AND** active connection is pre-selected if one exists
- **AND** placeholder shows "Select connection..." if no active connection

#### Scenario: Change connection
- **WHEN** user selects a different connection from dropdown
- **THEN** subsequent queries execute against the new connection
- **AND** the dropdown preserves user's choice even if active connection changes

#### Scenario: Connection deleted
- **WHEN** the selected connection is deleted
- **THEN** dropdown falls back to active connection or first available
- **AND** user is notified of the change

#### Scenario: Show database type
- **WHEN** dropdown options are displayed
- **THEN** each option shows connection name and database type
- **AND** format is "connection-name (database-type)"

### Requirement: Query Execution
The system SHALL execute SQL queries against the selected connection and display results.

#### Scenario: Execute query
- **WHEN** user clicks Execute button or presses Ctrl+Enter
- **THEN** execute button immediately shows pressed/active state (instant feedback)
- **AND** SQL from textarea is sent to selected connection
- **AND** execute button is disabled during execution
- **AND** contextual loading indicator shows "Executing query..." with connection name

#### Scenario: Query success with results
- **WHEN** SELECT query completes successfully
- **THEN** results are displayed in a table format
- **AND** status bar shows execution time and row count
- **AND** column headers are displayed

#### Scenario: Query success without results
- **WHEN** INSERT/UPDATE/DELETE completes successfully
- **THEN** affected rows count is displayed
- **AND** status bar shows execution time

#### Scenario: Query error
- **WHEN** query execution fails
- **THEN** error message is displayed in results area
- **AND** error icon appears alongside error text (not color alone)
- **AND** error text uses distinct styling (red color plus bold)
- **AND** user can edit SQL and retry

### Requirement: Query Cancellation
The system SHALL support cancelling long-running queries.

#### Scenario: Cancel via button
- **WHEN** user clicks Cancel button during execution
- **THEN** query is aborted at database level
- **AND** "Query cancelled" message is displayed
- **AND** execute button is re-enabled

#### Scenario: Cancel via Escape key
- **WHEN** user presses Escape during execution
- **THEN** behavior is identical to clicking Cancel button

#### Scenario: Execute button state
- **WHEN** execution is in progress
- **THEN** execute button is disabled
- **AND** cancel button is visible
- **WHEN** execution completes or is cancelled
- **THEN** execute button is re-enabled
- **AND** cancel button is hidden

### Requirement: Results Table Display
The system SHALL display query results in a performant table format.

#### Scenario: Virtualized rendering
- **WHEN** query returns many rows
- **THEN** only visible rows are rendered in DOM
- **AND** scrolling remains smooth
- **AND** row positions are calculated based on fixed height

#### Scenario: Fixed header
- **WHEN** results table is displayed
- **THEN** column headers remain visible during scroll
- **AND** headers align with data columns

#### Scenario: NULL value display
- **WHEN** result contains NULL values
- **THEN** NULL is displayed in italic with muted color
- **AND** NULL is distinguishable from empty string

#### Scenario: Result truncation
- **WHEN** query returns more than 1000 rows
- **THEN** only first 1000 rows are displayed
- **AND** truncation warning is shown
- **AND** status bar indicates total row count if available

#### Scenario: Empty result set
- **WHEN** SELECT returns zero rows
- **THEN** message "Query returned 0 rows" is displayed
- **AND** column headers are still shown if available

### Requirement: Transaction Mode Toggle
The system SHALL provide a toggle button to switch between auto-commit and manual transaction modes.

#### Scenario: Auto-commit mode (toggle OFF - default)
- **WHEN** transaction mode toggle is OFF
- **THEN** each query commits immediately after execution
- **AND** no Commit/Rollback buttons are shown
- **AND** toggle displays "Auto-commit" label

#### Scenario: Manual transaction mode (toggle ON)
- **WHEN** transaction mode toggle is ON
- **THEN** changes are held pending until explicit commit
- **AND** Commit and Rollback buttons become visible
- **AND** pending changes counter is displayed
- **AND** toggle displays "Transaction" label

#### Scenario: Uncommitted changes indicator
- **WHEN** there are pending uncommitted changes
- **THEN** a warning-colored status banner is displayed below the toolbar
- **AND** banner shows "Uncommitted changes (N pending)" with count
- **AND** banner includes warning icon for visual prominence
- **AND** banner remains visible until changes are committed or rolled back

#### Scenario: Toggle transaction mode
- **WHEN** user clicks the transaction mode toggle button
- **THEN** mode switches between auto-commit and manual
- **AND** toggle state is visually distinct (on/off indicator)
- **AND** toggle state persists for the panel session

#### Scenario: Toggle disabled with pending changes
- **WHEN** there are uncommitted changes in manual mode
- **THEN** the toggle button is disabled
- **AND** tooltip explains "Commit or rollback pending changes first"

#### Scenario: Commit pending changes
- **WHEN** user clicks Commit with pending changes
- **THEN** all pending changes are committed
- **AND** pending counter resets to zero
- **AND** success feedback is shown

#### Scenario: Rollback pending changes
- **WHEN** user clicks Rollback with pending changes
- **THEN** all pending changes are discarded
- **AND** pending counter resets to zero
- **AND** rollback confirmation is shown

### Requirement: Destructive Operation Safety
The system SHALL provide safety mechanisms for destructive database operations.

#### Scenario: DELETE without WHERE warning
- **WHEN** user executes DELETE without WHERE clause
- **THEN** warning dialog appears before execution
- **AND** dialog shows table name and warns about full deletion
- **AND** user must explicitly confirm to proceed

#### Scenario: DROP confirmation
- **WHEN** user executes DROP statement
- **THEN** confirmation dialog requires typing object name
- **AND** operation only proceeds if name matches exactly
- **AND** dialog explains the operation is irreversible

#### Scenario: TRUNCATE warning
- **WHEN** user executes TRUNCATE statement
- **THEN** warning dialog explains TRUNCATE cannot be rolled back
- **AND** user must explicitly confirm to proceed

#### Scenario: DDL pending changes warning
- **WHEN** DDL is executed with pending uncommitted changes
- **THEN** warning shows DDL will auto-commit pending changes
- **AND** user can choose to proceed or cancel

#### Scenario: Dialog dismissal
- **WHEN** user dismisses destructive operation dialog without confirming
- **THEN** operation is cancelled
- **AND** no changes are made to database
- **AND** focus returns to SQL editor

#### Scenario: Dialog focus defaults to Cancel
- **WHEN** a destructive operation warning dialog opens
- **THEN** the Cancel button has initial focus (not Confirm)
- **AND** pressing Enter dismisses without executing

### Requirement: Keyboard Accessibility
The system SHALL be fully accessible via keyboard navigation.

#### Scenario: Tab order
- **WHEN** user presses Tab in script editor
- **THEN** focus moves in logical order: connection dropdown -> SQL textarea -> Execute button

#### Scenario: Execute shortcut
- **WHEN** focus is in SQL textarea
- **AND** user presses Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
- **THEN** query is executed

#### Scenario: Cancel shortcut
- **WHEN** query is executing
- **AND** user presses Escape
- **THEN** query is cancelled

#### Scenario: ARIA labels
- **WHEN** screen reader navigates script editor
- **THEN** all interactive elements have descriptive ARIA labels
- **AND** status changes are announced via ARIA live region
- **AND** query completion (success/error/cancel) is announced

### Requirement: Command Registration
The system SHALL register commands for opening and managing script editors.

#### Scenario: Command palette access
- **WHEN** user opens command palette
- **THEN** "dbooly: Open Script Editor" command is available
- **AND** invoking it opens a new script editor panel

#### Scenario: Tree view button
- **WHEN** user views connections tree
- **THEN** "New Query Script" button appears in tree view header
- **AND** clicking it opens a new script editor panel

#### Scenario: Extension cleanup
- **WHEN** extension is deactivated
- **THEN** all open script editor panels are disposed
- **AND** all pending queries are cancelled
