//-----------------------------------------------------------------------------
// Torque Game Engine
// 
// Copyright (c) 2001 GarageGames.Com
// Portions Copyright (c) 2001 by Sierra Online, Inc.
//-----------------------------------------------------------------------------


//------------------------------------------------------------------------------
// Hard coded images referenced from C++ code
//------------------------------------------------------------------------------

//   editor/SelectHandle.png
//   editor/DefaultHandle.png
//   editor/LockedHandle.png


//------------------------------------------------------------------------------
// Functions
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// Mission Editor 
//------------------------------------------------------------------------------

function Editor::create()
{
   // Not much to do here, build it and they will come...
   // Only one thing... the editor is a gui control which
   // expect the Canvas to exist, so it must be constructed
   // before the editor.
   new EditManager(Editor)
   {
      profile = "GuiContentProfile";
      horizSizing = "right";
      vertSizing = "top";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";
      helpTag = "0";
      open = false;
   };
}


function Editor::onAdd(%this)
{
   // Basic stuff
   exec("scripts/cursors.cs");
   exec("scripts/EditorProfiles.cs");

   // Tools
   exec("scripts/editor.bind.cs");
   exec("gui/ObjectBuilderGui.gui");

   // New World Editor
   exec("gui/EditorGui.gui");
   exec("scripts/EditorGui.cs");
   exec("gui/AIEWorkingDlg.gui");

   // World Editor
   exec("gui/WorldEditorSettingsDlg.gui");

   // Terrain Editor
   exec("gui/TerrainEditorVSettingsGui.gui");
   exec("gui/HelpDlg.gui");
   exec("scripts/help.cs");

   // do gui initialization...
   EditorGui.init();

   //
   exec("scripts/editorRender.cs");
}

function Editor::checkActiveLoadDone()
{
   if(isObject(EditorGui) && EditorGui.loadingMission)
   {
      Canvas.setContent(EditorGui);
      EditorGui.loadingMission = false;
      return true;
   }
   return false;
}

//------------------------------------------------------------------------------
function toggleEditor(%make)
{
   if (%make)
   {
      if (!$missionRunning) 
      {
         MessageBoxOK("Mission Required", "You must load a mission before starting the Mission Editor.", "");
         return;
      }

      $testcheats = 1;
      if (!isObject(Editor))
      {
         Editor::create();
         MissionCleanup.add(Editor);
      }
      if (Canvas.getContent() == EditorGui.getId())
         Editor.close();
      else
         Editor.open();
   }
}

