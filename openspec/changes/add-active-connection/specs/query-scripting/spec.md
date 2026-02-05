## ADDED Requirements

### Requirement: Global Query Script Editor
The system SHALL provide a webview-based script editor panel where users can write and execute SQL queries against database connections. Multiple script panels can be open simultaneously.

#### Scenario: Open script editor panel
- **WHEN** user executes `dbooly.openScriptEditor` command
- **THEN** a new webview panel opens with a SQL text area and connection dropdown
- **AND** the panel title indicates it is the Query Script Editor
- **AND** focus is placed in the SQL text area

#### Scenario: Multiple script panels
- **WHEN** user opens the script editor multiple times
- **THEN** multiple independent script panels are created
- **AND** each panel can target a different connection
- **AND** each panel maintains its own SQL content and results

#### Scenario: Script editor initial layout
- **WHEN** the script editor panel first opens
- **THEN** it contains a connection selector dropdown at the top
- **AND** a multi-line SQL text area with monospace font filling the panel
- **AND** an execute button (and keyboard shortcut hint)

#### Scenario: Script editor split layout after execution
- **WHEN** a query is executed successfully
- **THEN** the panel splits vertically into two panes
- **AND** the SQL text area remains in the top pane
- **AND** query results are displayed in the bottom pane
- **AND** a draggable divider allows resizing the panes

### Requirement: Script Connection Selection
The system SHALL allow users to select which database connection to execute queries against, defaulting to the active connection.

#### Scenario: Default to active connection
- **WHEN** the script editor opens and an active connection exists
- **THEN** the connection dropdown shows the active connection as selected

#### Scenario: Default when no active connection
- **WHEN** the script editor opens and no connection is active
- **THEN** the connection dropdown shows a prompt to select a connection
- **AND** the execute button is disabled until a connection is selected

#### Scenario: Change target connection
- **WHEN** user selects a different connection from the dropdown
- **THEN** subsequent query executions target the selected connection
- **AND** the selection persists until changed or the panel is closed

#### Scenario: Selected connection persists during active changes
- **WHEN** the active connection changes while a script editor has a different connection selected
- **THEN** the script editor retains its current selection
- **AND** does not automatically switch to the new active connection

#### Scenario: Connection dropdown updates
- **WHEN** connections are added or removed while the script editor is open
- **THEN** the dropdown options update to reflect available connections
- **AND** if the selected connection is removed, selection falls back to active or first available

#### Scenario: Connection status in dropdown
- **WHEN** the connection dropdown is displayed
- **THEN** each connection option shows its name and database type
- **AND** the currently selected connection is clearly indicated

### Requirement: Query Execution
The system SHALL execute SQL queries entered in the script editor against the selected database connection with proper loading feedback and cancellation support.

#### Scenario: Execute SELECT query
- **WHEN** user enters a SELECT query and clicks execute (or presses Ctrl+Enter / Cmd+Enter)
- **THEN** the query is executed against the selected connection
- **AND** results are displayed in the bottom pane in table format
- **AND** row count and execution time are shown in a status bar

#### Scenario: Execute non-SELECT query
- **WHEN** user enters an INSERT, UPDATE, or DELETE query and executes it
- **THEN** the query is executed against the selected connection
- **AND** the number of affected rows is displayed
- **AND** execution time is shown

#### Scenario: Query execution error
- **WHEN** a query fails to execute (syntax error, constraint violation, etc.)
- **THEN** the error message from the database is displayed in the results pane
- **AND** the error is styled distinctly (e.g., red text)
- **AND** previous results are cleared

#### Scenario: Execute without connection
- **WHEN** user attempts to execute a query with no connection selected
- **THEN** an error message prompts the user to select a connection
- **AND** the query is not executed

#### Scenario: Keyboard shortcut execution
- **WHEN** user presses Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac) in the text area
- **THEN** the query is executed
- **AND** behavior is identical to clicking the execute button

### Requirement: Query Execution Feedback
The system SHALL provide clear visual feedback during query execution including loading states and cancellation.

#### Scenario: Loading state during execution
- **WHEN** a query is being executed
- **THEN** an indeterminate progress indicator is displayed
- **AND** the execute button is disabled to prevent duplicate submissions
- **AND** a cancel button becomes visible

#### Scenario: Cancel long-running query
- **WHEN** user clicks the cancel button during query execution
- **THEN** the query is aborted
- **AND** a cancellation message is displayed in the results area
- **AND** the execute button is re-enabled

#### Scenario: Execution complete feedback
- **WHEN** query execution completes (success or error)
- **THEN** the progress indicator is hidden
- **AND** the execute button is re-enabled
- **AND** the cancel button is hidden

### Requirement: Query Results Display
The system SHALL display query results in a readable tabular format within the script editor's results pane.

#### Scenario: Display SELECT results
- **WHEN** a SELECT query returns results
- **THEN** column headers are displayed in a fixed header row
- **AND** rows are displayed in a scrollable table body
- **AND** null values are indicated clearly (e.g., italic "NULL")
- **AND** the table uses virtualized rendering for performance

#### Scenario: Empty result set
- **WHEN** a SELECT query returns zero rows
- **THEN** a message indicates "0 rows returned"
- **AND** column headers are still displayed if available

#### Scenario: Large result set handling
- **WHEN** a query returns more than 1000 rows
- **THEN** results are limited to 1000 rows
- **AND** a warning message indicates results were truncated
- **AND** the total row count is shown if available from the database

#### Scenario: Results pane status bar
- **WHEN** results are displayed
- **THEN** a status bar shows the connected database name
- **AND** the execution time in milliseconds
- **AND** the row count (e.g., "42 rows" or "1000 of 5432 rows")

#### Scenario: Resizable split pane
- **WHEN** the results pane is visible
- **THEN** users can drag the divider between SQL and results panes
- **AND** the pane sizes are adjusted accordingly
- **AND** minimum heights are enforced to keep both panes usable

### Requirement: Keyboard Accessibility
The system SHALL support full keyboard navigation for the script editor panel.

#### Scenario: Tab navigation
- **WHEN** user presses Tab in the script editor
- **THEN** focus moves between connection dropdown, SQL textarea, and execute button
- **AND** the focus order is logical (top to bottom, left to right)

#### Scenario: Execute via keyboard
- **WHEN** focus is in the SQL textarea
- **THEN** Ctrl+Enter / Cmd+Enter executes the query
- **AND** user does not need to tab to the execute button

#### Scenario: Cancel via keyboard
- **WHEN** a query is executing and user presses Escape
- **THEN** the query is cancelled
- **AND** behavior is identical to clicking the cancel button

### Requirement: Transaction Mode Management
The system SHALL support configurable transaction modes to balance safety and convenience during query execution.

#### Scenario: Auto-commit mode for SELECT queries
- **WHEN** user executes a SELECT query
- **THEN** the query executes without starting a transaction
- **AND** no commit/rollback is required
- **AND** minimal database locks are held

#### Scenario: Smart commit mode for data modification
- **WHEN** smart commit is enabled and user executes INSERT, UPDATE, or DELETE
- **THEN** the system automatically switches to manual commit mode
- **AND** changes are held pending until explicit commit
- **AND** a pending changes indicator is displayed

#### Scenario: Manual commit mode
- **WHEN** manual commit mode is active and user executes a modifying query
- **THEN** changes are held in a transaction
- **AND** Commit and Rollback buttons become enabled
- **AND** a counter shows the number of pending statements

#### Scenario: Commit pending changes
- **WHEN** user clicks Commit with pending changes
- **THEN** all pending changes are committed to the database
- **AND** the pending counter resets to zero
- **AND** success feedback is displayed

#### Scenario: Rollback pending changes
- **WHEN** user clicks Rollback with pending changes
- **THEN** all pending changes are discarded
- **AND** the pending counter resets to zero
- **AND** rollback confirmation is displayed

#### Scenario: Transaction mode indicator
- **WHEN** the script editor is displayed
- **THEN** the current transaction mode (Auto/Manual/Smart) is visible
- **AND** users can change the mode via a dropdown or toggle

### Requirement: Destructive Operation Safety
The system SHALL provide safety mechanisms for destructive database operations to prevent accidental data loss.

#### Scenario: DELETE without WHERE clause warning
- **WHEN** user executes DELETE without a WHERE clause
- **THEN** a warning dialog appears before execution
- **AND** the dialog shows the table name and warns about full table deletion
- **AND** user must explicitly confirm to proceed

#### Scenario: DROP operation confirmation
- **WHEN** user executes a DROP statement (table, database, etc.)
- **THEN** a confirmation dialog appears
- **AND** the dialog requires user to type the object name to confirm
- **AND** the operation only proceeds if the typed name matches exactly

#### Scenario: TRUNCATE operation warning
- **WHEN** user executes a TRUNCATE statement
- **THEN** a warning dialog explains TRUNCATE cannot be rolled back
- **AND** user must explicitly confirm to proceed
- **AND** auto-commit mode is temporarily enabled for this statement

#### Scenario: DDL auto-commit behavior
- **WHEN** user executes DDL statements (CREATE, ALTER, DROP)
- **THEN** the system warns that DDL auto-commits pending transactions
- **AND** any pending changes are committed before DDL execution
- **AND** the DDL statement executes with auto-commit semantics

#### Scenario: Cancel destructive operation
- **WHEN** user dismisses a destructive operation warning dialog without confirming
- **THEN** the operation is cancelled
- **AND** no changes are made to the database
- **AND** focus returns to the SQL editor
