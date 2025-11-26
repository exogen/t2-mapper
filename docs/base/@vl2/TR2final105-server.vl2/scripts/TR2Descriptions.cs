
////////////////////////////////////////////////////////////////////////////////
// Special DescriptionDatas
$DefaultDescription = new ScriptObject() {
   text = "Grab";
   value = 0;
   sound = "blah.wav";
   class = DescriptionData;
   numParameters = 0;
};

$G4Description = new ScriptObject() {
   text = "Go-go Gadget Grab";
   value = 5;
   sound = "blah.wav";
   class = DescriptionData;
   numParameters = 0;
};


// DescriptionData components
// [Passer direction, pass direction, flag direction]

$DescriptionList = new ScriptObject() {
   class = DescriptionList;
};

function DescriptionList::get(%this, %a, %b, %c)
{
   return $DescriptionList[%a, %b, %c];
}

////////////////////////////////////////////////////////////////////////////////
//  Horizontal dominance (straight pass)
$DescriptionList[0,0,0] = new ScriptObject() {
   text = "Bullet";
   value = 5;
   sound = Description000Sound;
   class = DescriptionData;
};


$DescriptionList[0,0,1] = new ScriptObject() {
   text = "Heist";
   value = 7;
   sound = Description001Sound;
   class = DescriptionData;
};

$DescriptionList[0,0,2] = new ScriptObject() {
   text = "Smack Shot";
   value = 9;
   sound = Description002Sound;
   class = DescriptionData;
};

////////////////////////////////////////////////////////////////////////////////
//  Horizontal dominance (pass back)
$DescriptionList[0,1,0] = new ScriptObject() {
   text = "Jab";
   value = 9;
   sound = Description010Sound;
   class = DescriptionData;
};


$DescriptionList[0,1,1] = new ScriptObject() {
   text = "Back Breaker";
   value = 11;
   sound = Description011Sound;
   class = DescriptionData;
};


$DescriptionList[0,1,2] = new ScriptObject() {
   text = "Leet Lob";
   value = 12;
   sound = Description012Sound;
   class = DescriptionData;
};


////////////////////////////////////////////////////////////////////////////////
//  Horizontal dominance (perpendicular pass)
$DescriptionList[0,2,0] = new ScriptObject() {
   text = "Peeler";
   value = 22;
   sound = Description020Sound;
   class = DescriptionData;
};

$DescriptionList[0,2,1] = new ScriptObject() {
   text = "Blender";
   value = 25;
   sound = Description021Sound;
   class = DescriptionData;
};

$DescriptionList[0,2,2] = new ScriptObject() {
   text = "Glass Smash";
   value = 28;
   sound = Description022Sound;
   class = DescriptionData;
};


////////////////////////////////////////////////////////////////////////////////
//  Upward dominance (straight pass)
$DescriptionList[1,0,0] = new ScriptObject() {
   text = "Ascension";
   value = 7;
   sound = Description100Sound;
   class = DescriptionData;
};

$DescriptionList[1,0,1] = new ScriptObject() {
   text = "Elevator";
   value = 9;
   sound = Description101Sound;
   class = DescriptionData;
};


$DescriptionList[1,0,2] = new ScriptObject() {
   text = "Rainbow";
   value = 7;
   sound = Description102Sound;
   class = DescriptionData;
};


////////////////////////////////////////////////////////////////////////////////
//  Upward dominance (pass back)
$DescriptionList[1,1,0] = new ScriptObject() {
   text = "Bomb";
   value = 9;
   sound = Description110Sound;
   class = DescriptionData;
};

$DescriptionList[1,1,1] = new ScriptObject() {
   text = "Deliverance";
   value = 11;
   sound = Description111Sound;
   class = DescriptionData;
};

$DescriptionList[1,1,2] = new ScriptObject() {
   text = "Crank";
   value = 12;
   sound = Description112Sound;
   class = DescriptionData;
};

////////////////////////////////////////////////////////////////////////////////
//  Upward dominance (pass perpendicular)
$DescriptionList[1,2,0] = new ScriptObject() {
   text = "Fling";
   value = 18;
   sound = Description120Sound;
   class = DescriptionData;
};

$DescriptionList[1,2,1] = new ScriptObject() {
   text = "Quark";
   value = 20;
   sound = Description121Sound;
   class = DescriptionData;
};

$DescriptionList[1,2,2] = new ScriptObject() {
   text = "Juggle Toss";
   value = 22;
   sound = Description122Sound;
   class = DescriptionData;
};

////////////////////////////////////////////////////////////////////////////////
//  Downward dominance (straight pass)
$DescriptionList[2,0,0] = new ScriptObject() {
   text = "Yo-yo";
   value = 7;
   sound = Description200Sound;
   class = DescriptionData;
};

$DescriptionList[2,0,1] = new ScriptObject() {
   text = "Skydive";
   value = 9;
   sound = Description201Sound;
   class = DescriptionData;
};


$DescriptionList[2,0,2] = new ScriptObject() {
   text = "Jolt";
   value = 11;
   sound = Description202Sound;
   class = DescriptionData;
};


////////////////////////////////////////////////////////////////////////////////
//  Downward dominance (pass back)
$DescriptionList[2,1,0] = new ScriptObject() {
   text = "Prayer";
   value = 10;
   sound = Description210Sound;
   class = DescriptionData;
};

$DescriptionList[2,1,1] = new ScriptObject() {
   text = "Mo-yo-yo";
   value = 12;
   sound = Description211Sound;
   class = DescriptionData;
};

$DescriptionList[2,1,2] = new ScriptObject() {
   text = "Rocket";
   value = 14;
   sound = Description212Sound;
   class = DescriptionData;
};

////////////////////////////////////////////////////////////////////////////////
//  Downward dominance (pass perpendicular)
$DescriptionList[2,2,0] = new ScriptObject() {
   text = "Blast";
   value = 20;
   sound = Description220Sound;
   class = DescriptionData;
};

$DescriptionList[2,2,1] = new ScriptObject() {
   text = "Deep Dish";
   value = 23;
   sound = Description221Sound;
   class = DescriptionData;
};

$DescriptionList[2,2,2] = new ScriptObject() {
   text = "Bunny Bump";
   value = 25;
   sound = Description222Sound;
   class = DescriptionData;
};

