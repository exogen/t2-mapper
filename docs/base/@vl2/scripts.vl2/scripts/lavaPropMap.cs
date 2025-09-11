//-------------------------------------- Desert interior texture property mapping

addMaterialMapping("lava/ds_ichute01", "environment: special/chuteTexture 0.25");
addMaterialMapping("lava/ds_ichute02", "environment: special/chuteTexture 0.25");
addMaterialMapping("lava/ds_jet01", "environment: special/lavareflect 0.3");
addMaterialMapping("lava/ds_jet02", "environment: special/lavareflect 0.3");

//"Color: red green blue startAlpha endAlpha"
//Soft  sound = 0
//Hard  sound = 1
//Metal sound = 2
//Snow  sound = 3
addMaterialMapping("terrain/LavaWorld.Crust",       "color: 0.0 0.0 0.0 0.7 0.0",  "sound: 0");
addMaterialMapping("terrain/LavaWorld.LavaRockHot", "color: 0.0 0.0 0.0 0.7 0.0",  "sound: 0");
addMaterialMapping("terrain/LavaWorld.MuddyAsh",    "color: 0.0 0.0 0.0 0.7 0.0",  "sound: 0");
addMaterialMapping("terrain/LavaWorld.RockBlack",   "color: 0.0 0.0 0.0 0.7 0.0",  "sound: 0");
