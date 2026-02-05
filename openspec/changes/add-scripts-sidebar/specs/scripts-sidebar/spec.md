## ADDED Requirements

### Requirement: Scripts Tree View
The system SHALL display a "Scripts" section in the dbooly sidebar below the Connections section, showing saved SQL scripts organized in a hierarchical tree structure.

#### Scenario: Scripts section display
- **WHEN** the extension activates
- **THEN** the Scripts section appears below Connections in the dbooly sidebar
- **AND** the section header shows "Scripts" with Add Script and Add Folder buttons

#### Scenario: Empty state
- **WHEN** no scripts are saved
- **THEN** the tree view displays a welcome message with "Save a script to see it here"
- **AND** an "Add Script" action link is shown

#### Scenario: Display scripts and folders
- **WHEN** scripts and folders exist
- **THEN** folders are displayed with folder icons
- **AND** scripts are displayed with file icons
- **AND** items are sorted alphabetically within each level (folders first, then scripts)

#### Scenario: Expand folder
- **WHEN** user expands a folder
- **THEN** the folder's child scripts and subfolders are revealed
- **AND** nested items maintain their hierarchical indentation

### Requirement: Script Storage
The system SHALL persist scripts globally using VSCode's globalState API, allowing scripts to be accessed across all workspaces.

#### Scenario: Save new script
- **WHEN** user creates a new script with name and SQL content
- **THEN** the script is stored in globalState with a unique ID
- **AND** the script appears in the Scripts tree view

#### Scenario: Load scripts on startup
- **WHEN** the extension activates
- **THEN** previously saved scripts are loaded from globalState
- **AND** the folder hierarchy is reconstructed

#### Scenario: Script data structure
- **WHEN** a script is stored
- **THEN** it contains: id, name, sql content, and optional parentFolderId
- **AND** the id is a unique identifier (UUID)

### Requirement: Folder Storage
The system SHALL support organizing scripts into folders with nested folder support.

#### Scenario: Create folder
- **WHEN** user creates a new folder
- **THEN** the folder is stored with a unique ID and name
- **AND** the folder appears in the Scripts tree view

#### Scenario: Folder data structure
- **WHEN** a folder is stored
- **THEN** it contains: id, name, and optional parentFolderId
- **AND** the id is a unique identifier (UUID)

#### Scenario: Nested folders
- **WHEN** user creates a folder inside another folder
- **THEN** the child folder's parentFolderId references the parent folder's id
- **AND** the hierarchy is displayed correctly in the tree view

### Requirement: Script CRUD Operations
The system SHALL provide commands to create, rename, and delete scripts.

#### Scenario: Create script at root
- **WHEN** user clicks "Add Script" button in the view title
- **THEN** an input box prompts for the script name
- **AND** a new empty script is created at the root level
- **AND** the script opens in the Script Editor Panel

#### Scenario: Create script in folder
- **WHEN** user right-clicks a folder and selects "New Script"
- **THEN** an input box prompts for the script name
- **AND** a new empty script is created inside that folder

#### Scenario: Rename script
- **WHEN** user right-clicks a script and selects "Rename"
- **THEN** an input box prompts with the current name pre-filled
- **AND** the script name is updated upon confirmation

#### Scenario: Delete script
- **WHEN** user right-clicks a script and selects "Delete"
- **THEN** a confirmation dialog appears
- **AND** upon confirmation, the script is removed from storage
- **AND** the tree view updates to reflect the deletion

### Requirement: Folder CRUD Operations
The system SHALL provide commands to create, rename, and delete folders.

#### Scenario: Create folder at root
- **WHEN** user clicks "Add Folder" button in the view title
- **THEN** an input box prompts for the folder name
- **AND** a new empty folder is created at the root level

#### Scenario: Create subfolder
- **WHEN** user right-clicks a folder and selects "New Folder"
- **THEN** an input box prompts for the folder name
- **AND** a new folder is created inside the parent folder

#### Scenario: Rename folder
- **WHEN** user right-clicks a folder and selects "Rename"
- **THEN** an input box prompts with the current name pre-filled
- **AND** the folder name is updated upon confirmation

#### Scenario: Delete empty folder
- **WHEN** user deletes a folder that has no children
- **THEN** a confirmation dialog appears
- **AND** upon confirmation, the folder is removed from storage

#### Scenario: Delete folder with contents
- **WHEN** user deletes a folder that contains scripts or subfolders
- **THEN** a warning dialog appears indicating contents will also be deleted
- **AND** upon confirmation, the folder and all its contents are recursively removed

### Requirement: Script Opening
The system SHALL open scripts in the Script Editor Panel when activated.

#### Scenario: Open script via double-click
- **WHEN** user double-clicks a script in the tree view
- **THEN** a Script Editor Panel opens with the script's SQL content
- **AND** the panel title is set to the script name

#### Scenario: Open script via context menu
- **WHEN** user right-clicks a script and selects "Open"
- **THEN** a Script Editor Panel opens with the script's SQL content

#### Scenario: Script uses active connection
- **WHEN** a script is opened
- **THEN** the Script Editor Panel's connection dropdown shows the active connection
- **AND** user can change the connection using the dropdown

### Requirement: Script Saving from Editor
The system SHALL allow saving SQL content from the Script Editor Panel back to a stored script.

#### Scenario: Save changes to existing script
- **WHEN** user modifies SQL in a Script Editor Panel opened from a saved script
- **AND** user invokes the save command (Ctrl+S or Save button)
- **THEN** the script's SQL content is updated in globalState
- **AND** a brief "Saved" indicator appears

#### Scenario: Save new script from editor
- **WHEN** user is in a Script Editor Panel with unsaved content
- **AND** user invokes "Save As Script" command
- **THEN** an input box prompts for the script name
- **AND** optionally a folder picker appears for location
- **AND** the script is saved to the Scripts tree
