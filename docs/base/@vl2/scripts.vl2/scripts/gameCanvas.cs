function SimSet::removeStable(%this, %object)
{
   if(%this.getCount() < 2)
   {
      %this.remove(%object);
      return;
   }
   %last = %this.getObject(%this.getCount() - 1);
   %this.remove(%object);
   %this.pushToBack(%last);
}

if(!isObject(GameDialogSet))
{
   new SimSet(GameDialogSet);
   RootGroup.add(GameDialogSet);
}

function GuiCanvas::setGameMode(%this, %on)
{
   if(%this.gameMode == %on)
      return;

   %this.gameMode = %on;
   if(%this.gameMode)
   {
      %this.setContent(%this.gameContent);
      for(%i = 0; %i < GameDialogSet.getCount(); %i++)
         %this.pushDialog(GameDialogSet.getObject(%i));
   }
   else
      Canvas.setContent(LobbyGui);
}

function GuiCanvas::pushGameDialog(%this, %dialog)
{
   GameDialogSet.add(%dialog);
   if(%this.gameMode)
      %this.pushDialog(%dialog);
}

function GuiCanvas::popGameDialog(%this, %dialog)
{
   GameDialogSet.removeStable(%dialog);
   if(%this.gameMode)
      %this.popDialog(%dialog);
}