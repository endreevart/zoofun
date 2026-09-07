export type ZooRecord = {
  spec: { id: string };
};

export type ZooChoice<T extends ZooRecord = ZooRecord> = {
  records: T[];
  owner: string | null;
  pushLocal: boolean;
  writeLocal: boolean;
};

/** Cloud wins when the family changes. Do not copy the previous login onto a new one. */
export function chooseZoo<T extends ZooRecord>(input: {
  local: T[];
  remote: T[] | null;
  remoteOwner: string | null;
  localOwner: string | null;
}): ZooChoice<T> {
  const { local, remote, remoteOwner, localOwner } = input;
  if (remote === null || !remoteOwner) {
    return { records: local, owner: localOwner, pushLocal: false, writeLocal: false };
  }
  if (localOwner !== remoteOwner) {
    return { records: remote, owner: remoteOwner, pushLocal: false, writeLocal: true };
  }
  if (remote.length === 0 && local.length > 0) {
    return { records: local, owner: remoteOwner, pushLocal: true, writeLocal: false };
  }
  if (remote.length > 0) {
    return { records: remote, owner: remoteOwner, pushLocal: false, writeLocal: true };
  }
  return { records: [], owner: remoteOwner, pushLocal: false, writeLocal: true };
}
