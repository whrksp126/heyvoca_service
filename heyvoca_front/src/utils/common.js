export const backendUrl = import.meta.env.VITE_BACKEND_URL;
console.log(backendUrl);
// 비동기 fetch api
export async function fetchDataAsync(url, method, data, form=false){
  let newUrl = url;
  const headers = {
    // 'Authorization': `Bearer ${accessToken}`
  }
  if(!form){ headers['Content-Type'] = `application/json`}
  let fetchOptions = { method, headers};
  if(method !== 'GET' && form) {
    const formData = new FormData();
    formData.append('json_data', JSON.stringify(data.json_data)) 
    data.form_data.forEach(({key, value})=>{
      formData.append(key, value);
    })
    fetchOptions.body = formData
  }
  if(method !== 'GET' && !form){
    fetchOptions.body = JSON.stringify(data);
  }
  if(method == 'GET' || method == 'DELETE'){
    newUrl += `?`
    for (const key in data) {
      const value = data[key];
      newUrl += `${key}=${value}&`;
    }
    console.log(newUrl);
  }
  fetchOptions.credentials = 'include';
  try {
    const response = await fetch(newUrl, fetchOptions);
    const contentType = response.headers.get('Content-Type');
    if (response.ok) {
      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('text')) {
        return await response.text();
      } else if (contentType.includes('audio')) {
        return await response.blob();
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }
    } else {
      throw new Error('문제가 발생했습니다.');
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// URL에서 파라미터 값 가져오기
export const getValueFromURL = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};