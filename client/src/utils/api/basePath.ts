interface WindowWithBasePath extends Window {
  __BASE_PATH__?: string;
}

const getBasePath = (): string => {
  const win = window as WindowWithBasePath;
  return win.__BASE_PATH__ || '';
};

export const basePath = getBasePath();