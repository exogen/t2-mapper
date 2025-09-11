
package LakObjHud {
function setupObjHud(%gameType)
{
	switch$ (%gameType)
	{
	case LakRabbitGame:
		// set separators
		objectiveHud.setSeparators("56 156");
		objectiveHud.disableHorzSeparator();

		// Your score label ("SCORE")
		objectiveHud.scoreLabel = new GuiTextCtrl() {
		profile = "GuiTextObjGreenLeftProfile";
		horizSizing = "right";
		vertSizing = "bottom";
		position = "4 3";
		extent = "50 16";
			visible = "1";
			text = "SCORE";
		};
		// Your score
		objectiveHud.yourScore = new GuiTextCtrl() {
			profile = "GuiTextObjGreenCenterProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "60 3";
			extent = "90 16";
			visible = "1";
		};
		// Rabbit label ("RABBIT")
		objectiveHud.rabbitLabel = new GuiTextCtrl() {
			profile = "GuiTextObjGreenLeftProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "4 19";
			extent = "50 16";
			visible = "1";
			text = "RABBIT";
		};
		// rabbit name
		objectiveHud.rabbitName = new GuiTextCtrl() {
			profile = "GuiTextObjGreenCenterProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "60 19";
			extent = "90 16";
			visible = "1";
		};

		objectiveHud.add(objectiveHud.scoreLabel);
		objectiveHud.add(objectiveHud.yourScore);
		objectiveHud.add(objectiveHud.rabbitLabel);
		objectiveHud.add(objectiveHud.rabbitName);
	}
	parent::setupObjHud(%gameType);
}
};
activatePackage(LakObjHud);
