function getTouchPoint(event: any): any {
  const list = event && (event.changedTouches || event.touches);
  return list && list.length ? list[0] : null;
}

function stopNativeGesture(event: any): void {
  if (event && event.stopPropagation) event.stopPropagation();
  if (event && event.preventDefault) event.preventDefault();
}

function isHorizontalGesture(vm: any, event: any): boolean {
  const point = getTouchPoint(event);
  if (!point || vm.__githubTouchStartX === undefined || vm.__githubTouchStartY === undefined) return false;
  const deltaX = Number(point.clientX) - Number(vm.__githubTouchStartX);
  const deltaY = Number(point.clientY) - Number(vm.__githubTouchStartY);
  return Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY);
}

export function startGithubFixedTouch(vm: any, event: any): void {
  const point = getTouchPoint(event);
  if (!point) return;
  vm.__githubTouchStartX = Number(point.clientX);
  vm.__githubTouchStartY = Number(point.clientY);
}

export function moveGithubFixedTouch(vm: any, event: any): void {
  if (isHorizontalGesture(vm, event)) stopNativeGesture(event);
}

export function endGithubFixedTouch(vm: any, event: any): void {
  if (isHorizontalGesture(vm, event)) stopNativeGesture(event);
  vm.__githubTouchStartX = undefined;
  vm.__githubTouchStartY = undefined;
}
