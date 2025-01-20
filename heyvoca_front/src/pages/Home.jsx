// src/pages/Home.js
import React from 'react';
import Main from '../components/home/Main';
import Header from '../components/component/Header';

const Home = () => {
  return (
    <div 
      className="
        flex flex-col items-center justify-center 
        h-screen 
        mx-auto
      "
      style={{ paddingTop: '70px' }}
    >
      <Header />
      <Main />
    </div>
  );
};

export default Home;
