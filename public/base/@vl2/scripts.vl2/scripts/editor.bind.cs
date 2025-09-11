//-----------------------------------------------------------------------------
// Torque Game Engine
// 
// Copyright (c) 2001 GarageGames.Com
// Portions Copyright (c) 2001 by Sierra Online, Inc.
//-----------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Mission Editor Manager
new ActionMap(EditorMap);

EditorMap.bindCmd(keyboard, "f1", "contextHelp();", "");
EditorMap.bindCmd(keyboard, "escape", "editor.close();", "");
EditorMap.bindCmd(keyboard, "i", "Canvas.pushDialog(interiorDebugDialog);", "");

