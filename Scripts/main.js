const { ToDoDataProvider } = require("./ToDoDataProvider.js");

var treeView = null;

exports.activate = function() {
  // Do work when the extension is activated
  
  // Create the TreeView
  treeView = new TreeView("todo", {
    dataProvider: new ToDoDataProvider()
  });
  
  treeView.onDidChangeSelection((selection) => {
    // console.log("New selection: " + selection.map((e) => e.name));
  });
  
  treeView.onDidExpandElement((element) => {
    // console.log("Expanded: " + element.name);
  });
  
  treeView.onDidCollapseElement((element) => {
    // console.log("Collapsed: " + element.name);
  });
  
  treeView.onDidChangeVisibility(() => {
    // console.log("Visibility Changed");
  });
  
  // TreeView implements the Disposable interface
  nova.subscriptions.add(treeView);
}

exports.deactivate = function() {
  // Clean up state before the extension is deactivated
}

nova.commands.register("todo.addPath", () => {
  let workspaceIgnorePaths = nova.workspace.config.get("todo.workspace-ignore-paths") + "," +
    nova.workspace.config.get("todo.selected-ignore-path");
    
  nova.workspace.config.set("todo.workspace-ignore-paths", workspaceIgnorePaths);
  nova.workspace.config.set("todo.selected-ignore-path", "");
});

// nova.commands.register("todo.group", () => {
//   console.log("Change grouping!");
// }); 

nova.commands.register("todo.refresh", () => {
  let selection = treeView.selection;
  console.log("Refresh!");
});

nova.commands.register("todo.ignoreDirectory", () => {
  let selection = treeView.selection;
  // nova.workspace.openFile(selection.map((e) => e.filePath));
  console.log("IGNORE DIR!", selection.map((e) => e.filePath));
});

nova.commands.register("todo.doubleClick", () => {
  // Invoked when an item is double-clicked
  let selection = treeView.selection;
  nova.workspace.openFile(selection.map((e) => e.filePath));
  nova.workspace.activeTextEditor.scrollToPosition(selection.map((e) => e.position));
});

nova.commands.register("todo.openFile", () => {
  let selection = treeView.selection;
  
  nova.workspace.openFile(selection.map((e) => e.filePath));

  if (selection.map((e) => e.position) !== null) {
    nova.workspace.activeTextEditor.scrollToPosition(selection.map((e) => e.position));
  }
});





