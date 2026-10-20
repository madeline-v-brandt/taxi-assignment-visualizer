// Challenge Mode bookkeeping: the user's own (possibly unfinished) assignment of taxis to passengers.
// Pure data with no drawing, so it is easy to test. pairs[i] is the passenger assigned to taxi i, or -1.

function createChallenge(n) {
  return { pairs: new Array(n).fill(-1), history: [] };
}

function taxiOf(challenge, passenger) {
  return challenge.pairs.indexOf(passenger);
}

function assignedCount(challenge) {
  return challenge.pairs.filter((p) => p !== -1).length;
}

function isComplete(challenge) {
  return assignedCount(challenge) === challenge.pairs.length;
}

// Pair a taxi with a passenger, keeping everything one-to-one: whoever either of them was paired
// with before is set free. Pairing a taxi with the passenger it already has removes that pair.
function assignPair(challenge, taxi, passenger) {
  challenge.history.push([...challenge.pairs]);
  if (challenge.pairs[taxi] === passenger) {
    challenge.pairs[taxi] = -1;
    return;
  }
  const previousTaxi = taxiOf(challenge, passenger);
  if (previousTaxi !== -1) challenge.pairs[previousTaxi] = -1;
  challenge.pairs[taxi] = passenger;
}

function clearPairs(challenge) {
  if (assignedCount(challenge) === 0) return;
  challenge.history.push([...challenge.pairs]);
  challenge.pairs.fill(-1);
}

function undoPair(challenge) {
  if (challenge.history.length > 0) challenge.pairs = challenge.history.pop();
}
