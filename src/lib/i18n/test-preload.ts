// Existing tests assert the Polish texts they were written against; they run
// in a Polish installation. Tests of the English layer set PRM_LOCALE themselves.
process.env.PRM_LOCALE ??= "pl";
