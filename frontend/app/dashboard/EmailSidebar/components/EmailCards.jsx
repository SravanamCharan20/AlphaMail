import React from "react";

const EmailCards = ({ msgs }) => {
  return (
    <div className="mt-4 border rounded-lg">
      {msgs.map((mail, index) => (
        <div key={index} className="border-b m-2 rounded-lg p-2 py-2">
          <p className="font-semibold">{mail.subject}</p>
          <p className="text-sm text-gray-500">{mail.from}</p>
          <p className="text-xs text-gray-400">
            {mail.snippet?.slice(0, 80)}...
          </p>
        </div>
      ))}
    </div>
  );
};

export default EmailCards;