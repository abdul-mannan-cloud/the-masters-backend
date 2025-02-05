const Measurements = require('../Models/Measurements')
  
  const getMeasurement = async (req, res) => {
    try {

        const { id } = req.params;
        console.log(id);
        const measurement = await Measurements.findById(id); 
        console.log(measurement);
        res.status(200).json({
        message: "Measurements retrieved successfully",
        measurement: measurement,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

const updateMeasurement = async (req, res) => {
    try {
        const {id} = req.params;
        const measurement = await Measurements
            .findByIdAndUpdate(id, req.body);
        res.status(200).json({
            message: "Measurements updated successfully",
            measurement: measurement,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({error: 'Internal server error'});
    }
}

  module.exports = {getMeasurement,updateMeasurement};