const { ToDoListItem } = require("./ToDoListItem.js");
const { FileLoader } = require("./FileLoader.js");
const { Configuration } = require("./Configuration.js");
const FUNCTIONS = require("./functions.js");

module.exports.ToDoDataProvider = class ToDoDataProvider {
  constructor(sortBy) { 
    this.loadData(sortBy);
  }
  
  /*
    This is the entry point for the data provider class.
    It serves to load tree items on initial extension
    activation and on reload.
  */
  loadData(sortBy) {
    this.rootItems = [];
    this.sortBy = sortBy;
    
    this.configuration = new Configuration;
    this.KEYWORDS = this.configuration.keywords;
    
    if (FUNCTIONS.isWorkspace()) {
      this.rootItems = this.getWorkspaceRootItems();
    } else {
      this.rootItems = this.getOpenDocumentsRootItems();
    }

    return this.rootItems;
  }
  
  /*
    Returns a promise to generates tree view items
    based on files open in the current Nova window.
    This is needed when the user does not have a
    current workspace open.
  */
  getOpenDocumentsRootItems() {
    return new Promise((resolve, reject) => {
      let rootItems = [];
      
      let openDocuments = nova.workspace.textDocuments.filter(doc => {
        if (doc.path !== undefined || doc.path !== null) {
          return doc.path;
        }
      });
      
      openDocuments = openDocuments.map(doc => {
        return (doc.path).toString();
      });
      openDocuments = openDocuments.filter(filePath => this.isAllowedName(filePath)); 
      openDocuments = openDocuments.filter(filePath => this.isAllowedExtension(filePath));
      
      let toDoListItems = this.findToDoItemsInFilePathArray(openDocuments);
      let groupedToDoListItems = this.groupListItems(toDoListItems);
      
      groupedToDoListItems.forEach((toDoListItem) => {
        rootItems = [...rootItems, toDoListItem];
      });
      
      resolve(rootItems);
    });
  }
  
  /*
    Returns a promise to generate tree view items
    based on files that exist in the current workspace.
  */
  getWorkspaceRootItems() {
    return new Promise((resolve, reject) => {
      let rootItems = [];
      let fileSearchResponse = this.getMatchedWorkspaceFiles();
      
      fileSearchResponse.then((response, reject) => {
        let toDoListItems = this.findToDoItemsInFilePathArray(response);
        let groupedToDoListItems = this.groupListItems(toDoListItems);
        
        groupedToDoListItems.forEach((toDoListItem) => {
          rootItems = [...rootItems, toDoListItem];
        });
        
        resolve(rootItems);
      });
      fileSearchResponse.catch((alert) => {
        reject(alert);
      });
    })
  }
  
  /*
    Uses the FileLoader class to search the current workspace
    path for files containing tag keywords. The search method
    makes use of the egrep command line application available
    in Unix based operating systems.
  */
  getMatchedWorkspaceFiles() {
    return new Promise((resolve, reject) => {
      let fileHandler = new FileLoader(nova.workspace.path, this.KEYWORDS);
      
      let files = fileHandler.egrepExec();
      
      files.then((response, reject) => {
        let filteredFiles = response.stdout;
        filteredFiles = filteredFiles.filter(filePath => this.isAllowedName(filePath));
        filteredFiles = filteredFiles.filter(filePath => this.isAllowedExtension(filePath));
        filteredFiles = filteredFiles.filter(filePath => this.isAllowedPath(filePath));
        
        resolve(filteredFiles);
      });
      files.catch((alert) => {
        reject(alert);
      });
    });
  }
  
  groupListItems(toDoListItems) {
    let groupedToDoListItems;
    
    if (this.sortBy == null || this.sortBy == 'file') {
      groupedToDoListItems = this.groupListItemsByFile(toDoListItems);
    } else {
      groupedToDoListItems = this.groupListItemsByTag(toDoListItems);
    }
    
    return groupedToDoListItems;
  }
  
  /*
    Accepts an ungrouped array of ToDoListItem objects and
    returns an array of ToDoListItem objects grouped by file.
  */
  groupListItemsByFile(toDoListItems) {
    let groupedtoDoListItems = [];
    let distinctFilePaths    = this.getUniqueFiles(toDoListItems);
    distinctFilePaths.forEach((distinctFilePath) => {
      groupedtoDoListItems.push(new ToDoListItem(nova.path.basename(distinctFilePath)));
      groupedtoDoListItems[groupedtoDoListItems.length - 1].filePath = distinctFilePath;
      
      let filePathToDoItems = toDoListItems.filter(
        toDoListItem => toDoListItem.filePath == distinctFilePath
      );
      
      filePathToDoItems.forEach(filePathToDoItem => {
        groupedtoDoListItems[groupedtoDoListItems.length - 1].addChild(filePathToDoItem);
      });
    });
    
    return groupedtoDoListItems;
  }
  
  /*
    Accepts an array of ToDoListItem objects and returns an array
    of primitive file name values.
  */
  getUniqueFiles(toDoListItems) {
    // 1) Map array to a new array containing only primitive values (don't want objects, just file names.
    // 2) Then use the Set object to store a collection of unique values,
    // 3) Which then uses the spread operator to construct a new array.
    return [...new Set(toDoListItems.map(item => item.filePath))];
  }
  
  groupListItemsByTag(toDoListItems) {
    let groupedtoDoListItems = [];
    let distinctTags = this.getUniqueTags(toDoListItems);
    
    distinctTags.forEach((distinctTag) => {
      groupedtoDoListItems.push(new ToDoListItem(distinctTag));
      
      let tagToDoItems = toDoListItems.filter(
        toDoListItem => toDoListItem.name == distinctTag
      );
      
      tagToDoItems.forEach(tagToDoItem => {
        groupedtoDoListItems[groupedtoDoListItems.length - 1].addChild(tagToDoItem);
      });
    });
    
    return groupedtoDoListItems;
  }
  
  getUniqueTags(toDoListItems) {
    return [...new Set(toDoListItems.map(item => item.name))];
  }
  
  /*
    Searches an array of files for keywords and returns an array
    of ToDoListItem objects for all specified files. Accepts an 
    array of file path string.
  */
  findToDoItemsInFilePathArray(filePathArray) {
    let toDoListItemArray = [];

    filePathArray.sort(FUNCTIONS.sortByFileName);
    
    filePathArray.forEach((filePath) => {
      let file = nova.fs.open(filePath);
      let fileSearchResults = this.findKeywordsInFile(file);
      
      if (fileSearchResults.length > 0) {
        toDoListItemArray = toDoListItemArray.concat(fileSearchResults);
      }
      
      file.close();
    });
    
    return toDoListItemArray;
  }
  
  /*
    Searches a file line by line for keywords
    and returns an array of ToDoListItem objects
    for a specific file. Accepts a Nova file object.
  */
  findKeywordsInFile(file) {
    let contents = file.readlines();
    
    let fileMatches = [];
    let fileLineStartPosition = 0;

    for(let i = 0; i < contents.length; i++) {
      let lineMatches = this.findKeywordsInLine(contents[i]);
      
      lineMatches.forEach((match) => {
        let toDoListItem      = new ToDoListItem(match.name);
        toDoListItem.filePath = file.path;
        toDoListItem.line     = i + 1;
        toDoListItem.column   = match.column;
        toDoListItem.position = fileLineStartPosition + match.column;
        toDoListItem.comment  = match.comment;
        
        fileMatches = fileMatches.concat(toDoListItem);
      });
      
      fileLineStartPosition += contents[i].length;
    }
    
    return fileMatches;
  }
  
  /*
    Searches a line of code for keywords
    and returns an array of objects containing the keyword,
    column number of the match as well as the text
    (most likely a comment) following the keyword.
  */
  findKeywordsInLine(line) {
    let matchRegex = new RegExp(`${this.KEYWORDS.join("|")}`);
    let lineMatches = [];
     
    this.KEYWORDS.forEach((keyword) => {
      let lineMatchIndex;
      
      if (this.configuration.caseSensitiveMatching == true) {
        lineMatchIndex = line.indexOf(keyword);
      } else {
        lineMatchIndex = line.toLowerCase().indexOf(keyword.toLowerCase());
      }
      
      while(lineMatchIndex >= 0) {
        this.extractCommentFromLine(keyword, lineMatchIndex, line);
        
        if (this.isTag(keyword, lineMatchIndex, line)) {  
          lineMatches.push(
            {
              name: keyword,
              column: lineMatchIndex + 1,
              comment: this.extractCommentFromLine(keyword, lineMatchIndex, line)
            }
          );
        
        }
        
        lineMatchIndex = line.indexOf(keyword, (lineMatchIndex + 1));
      }
    });
    
    return lineMatches;
  }
  
  /*
    Returns true if keyword at the currently evaluated index is followed by a : or ],
    in which case it is recognized as a tag.
  */
  isTag(keyword, lineMatchIndex, line) {
    let nextChar = line.charAt(lineMatchIndex + keyword.length);
    
    if (nextChar == ":" || nextChar == "]") {
      return true;
    } else {
      return false;
    }
  }
  
  /*
    Returns the line after the keyword and the : or ] character, trimming any whitespace.
  */
  extractCommentFromLine(keyword, lineMatchIndex, line) {
    let comment = line.substring(lineMatchIndex + (keyword.length + 1));
    
    return comment.trim();
  }
  
  /*
    Used to exclude specific file and directory names.
  */
  isAllowedName(path) {
    let pathElementArray = path.split("/");
    let exclusionFound = false;
    let count = 0;
    
    while (count < pathElementArray.length && exclusionFound !== true) {
      if (this.configuration.excludedNames.includes(pathElementArray[count])) {
        exclusionFound = true;
      }
      
      count++;
    }
    
    if (exclusionFound == true) {
      return false;
    } else {
      return true;
    }
  }
  
  /*
    Used to exclude specific extensions.
  */
  isAllowedExtension(path) {
    if (nova.fs.stat(path).isFile() == true) {
      if (!this.configuration.excludedExtensions.includes(nova.path.extname(path)) &&
        nova.path.extname(path) !== "") {
        return true;
      } else {
        return false;
      }
    } else {
      return true;
    }
  }
  
  /*
    Used to exclude specific file and directory paths.
  */
  isAllowedPath(path) {
    let pathFound = false;
    let excludedPathsIndex = 0;
    
    while ((excludedPathsIndex < this.configuration.excludedPaths.length) && pathFound !== true) {
      if (nova.path.normalize(path).includes(this.configuration.excludedPaths[excludedPathsIndex])) {
        pathFound = true;
      }
      
      excludedPathsIndex++;
    }

    if (pathFound == true) {
      return false;
    } else {
      return true;
    }
  }
  
  /*
    Returns the children tree item(s).
  */
  getChildren(toDoListItem) {
    if (!toDoListItem) {
      return this.rootItems;
    }
    else {
      return toDoListItem.children;
    }
  }
  
  /*
    Returns the parent tree item.
  */
  getParent(toDoListItem) {
    return toDoListItem.parent;
  }
  
  /*
    Returns a specific tree item.
  */
  getTreeItem(toDoListItem) {
    if (this.sortBy == 'file') {
      var item = new TreeItem(toDoListItem.name);
      
      if (toDoListItem.children.length > 0) {
        item.collapsibleState = TreeItemCollapsibleState.Expanded;
        item.image            = `__filetype${nova.path.extname(toDoListItem.filePath)}`;
        item.contextValue     = "file";
        item.tooltip          = toDoListItem.filePath;
        item.descriptiveText  = "(" + toDoListItem.children.length + ")";
      } else {
        item.image            = this.getIconImage(toDoListItem);
        item.command          = "todo.doubleClick";
        item.contextValue     = "tag";
        item.descriptiveText  = `${toDoListItem.comment} (Ln: ${toDoListItem.line}, Col: ${toDoListItem.column})`;
      }
    } else if (this.sortBy == 'tag') {
      if (toDoListItem.children.length > 0) {
        var item = new TreeItem(toDoListItem.name);
        item.collapsibleState = TreeItemCollapsibleState.Expanded;
        item.image            = this.getIconImage(toDoListItem);
        item.contextValue     = "tag";
        item.descriptiveText  = "(" + toDoListItem.children.length + ")";
      } else {
        var item = new TreeItem(toDoListItem.filePath);
        item.image            = `__filetype${nova.path.extname(toDoListItem.filePath)}`;
        item.command          = "todo.doubleClick";
        item.contextValue     = "file";
        item.tooltip          = `${toDoListItem.comment} (Ln: ${toDoListItem.line}, Col: ${toDoListItem.column})`;
      }    
    }
    
    return item;
  }
  
  /*
    Returns an appropriate icon name for a non-file tree item.
  */
  getIconImage(toDoListItem) {
    let itemType = toDoListItem.name.toLowerCase();
    
    if (itemType == 'todo' || itemType == 'fixme') {
      return toDoListItem.name.toLowerCase();
    } else {
      return "user";
    }
  }
}
